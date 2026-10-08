"""Admin subscriptions and billing — port of `routes/admin/subscriptions.ts`.

Three handlers. `POST /:id/cancel` ends access locally: payments are one-off
Paystack charges, so there is no Paystack subscription to cancel.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Request

from ...db import query, query_one
from ...errors import SimpleError
from ...js_compat import js_parse_int_or_nan
from ...json_response import jsjson
from ...logging import create_logger
from ...middleware.admin_auth import AdminUser, admin_auth
from ...services import plan_catalog
from ...services.audit_service import log_action
from ...services.plan_service import GRACE_DAYS, entitled
from ...validators.admin import update_subscription_schema
from ._util import client_ip

log = create_logger("Admin:Subscriptions")

router = APIRouter()


def _state(sub: dict[str, Any]) -> tuple[str, datetime | None]:
    """free | active | grace | expired | <status>, and when grace ends."""
    end = sub.get("current_period_end")
    grace_ends = end + timedelta(days=GRACE_DAYS) if end else None
    if (sub.get("plan") or "free") == "free":
        return "free", None
    if sub.get("status") != "active":
        return sub.get("status") or "inactive", grace_ends
    if end is None or end > datetime.now(UTC):
        return "active", grace_ends
    if grace_ends > datetime.now(UTC):
        return "grace", grace_ends
    return "expired", grace_ends


def _count(row: dict | None) -> int:
    return int((row or {}).get("count") or 0)


@router.get("")
@router.get("/")
async def list_subscriptions(request: Request):
    try:
        params = request.query_params
        plan = params.get("plan") or ""
        status = params.get("status") or ""
        limit = min(js_parse_int_or_nan(params.get("limit") or "25"), 100)
        offset = js_parse_int_or_nan(params.get("offset") or "0")

        conditions: list[str] = []
        args: list[Any] = []
        index = 1

        if plan:
            conditions.append(f"s.plan = ${index}")
            args.append(plan)
            index += 1
        if status:
            conditions.append(f"s.status = ${index}")
            args.append(status)
            index += 1

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        subscriptions = await query(
            f"""
            SELECT s.*, u.name as user_name, u.email as user_email
            FROM subscriptions s
            LEFT JOIN users u ON s.user_id = u.id
            {where}
            ORDER BY s.created_at DESC
            LIMIT ${index} OFFSET ${index + 1}
            """,
            *args,
            limit,
            offset,
        )

        for sub in subscriptions:
            sub["state"], sub["grace_ends_at"] = _state(sub)

        count_row = await query_one(
            f"SELECT COUNT(*) as count FROM subscriptions s {where}", *args
        )

        revenue = await query(
            f"""
            SELECT s.plan, COUNT(*) as count,
                   SUM(COALESCE(p.price, 0)) as revenue,
                   COALESCE(p.currency, 'NGN') as currency
            FROM subscriptions s
            LEFT JOIN plans p ON s.plan = p.id
            WHERE {entitled("s")}
            GROUP BY s.plan, p.price, p.currency
            ORDER BY revenue DESC
            """
        )

        return jsjson(
            {
                "subscriptions": subscriptions,
                "total": _count(count_row),
                "limit": limit,
                "offset": offset,
                "revenue": revenue,
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error(f"Subscriptions list error: {exc}")
        raise SimpleError("Failed to load subscriptions", 500) from None


@router.patch("/{subscription_id}")
async def update_subscription(
    subscription_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        body = await _json_body(request)
        data, issues = update_subscription_schema(body)
        if issues:
            raise SimpleError(issues[0]["message"], 400)
        if "plan" in data and not await plan_catalog.find(data["plan"]):
            raise SimpleError(f'Unknown plan "{data["plan"]}"', 400)

        updates: list[str] = []
        args: list[Any] = []
        index = 1

        for field in ("plan", "status", "events_limit", "domains_limit"):
            if field in data:
                updates.append(f"{field} = ${index}")
                args.append(data[field])
                index += 1

        if not updates:
            raise SimpleError("No fields to update", 400)

        updates.append("updated_at = NOW()")
        args.append(subscription_id)

        sub = await query_one(
            f"UPDATE subscriptions SET {', '.join(updates)} WHERE id = ${index} RETURNING *",
            *args,
        )

        if not sub:
            raise SimpleError("Subscription not found", 404)

        # Keep users.subscription in step with the plan.
        if "plan" in data:
            await query(
                """
                UPDATE users SET subscription = $1
                WHERE id = (SELECT user_id FROM subscriptions WHERE id = $2)
                """,
                data["plan"],
                subscription_id,
            )

        await log_action(
            admin_id=admin.user_id,
            action="subscription.update",
            target_type="subscription",
            target_id=subscription_id,
            details=data,
            ip_address=client_ip(request),
        )

        return jsjson(sub)
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Subscription update error: {exc}")
        raise SimpleError("Failed to update subscription", 500) from None


MAX_EXTEND_DAYS = 365


@router.post("/{subscription_id}/extend")
async def extend_subscription(
    subscription_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    """Add days to a paid period (support cases, comped time). Extends from the
    current end, or from now if it has already lapsed."""
    try:
        body = await _json_body(request)
        days = body.get("days")
        if not isinstance(days, int) or isinstance(days, bool) or not 1 <= days <= MAX_EXTEND_DAYS:
            raise SimpleError(f"days must be a whole number from 1 to {MAX_EXTEND_DAYS}", 400)

        sub = await query_one(
            """
            UPDATE subscriptions
            SET current_period_end = GREATEST(current_period_end, NOW())
                                     + make_interval(days => $2),
                status = 'active', updated_at = NOW()
            WHERE id = $1 AND plan <> 'free' AND current_period_end IS NOT NULL
            RETURNING *
            """,
            subscription_id,
            days,
        )
        if not sub:
            existing = await query_one(
                "SELECT plan, current_period_end FROM subscriptions WHERE id = $1",
                subscription_id,
            )
            if not existing:
                raise SimpleError("Subscription not found", 404)
            if existing["plan"] == "free":
                raise SimpleError("Free subscriptions have no period to extend", 400)
            raise SimpleError("This plan has no end date, so there is nothing to extend", 400)

        await log_action(
            admin_id=admin.user_id,
            action="subscription.extend",
            target_type="subscription",
            target_id=subscription_id,
            details={"days": days, "current_period_end": sub["current_period_end"].isoformat()},
            ip_address=client_ip(request),
        )
        sub["state"], sub["grace_ends_at"] = _state(sub)
        return jsjson(sub)
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Subscription extend error: {exc}")
        raise SimpleError("Failed to extend subscription", 500) from None


@router.post("/{subscription_id}/cancel")
async def cancel_subscription(
    subscription_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        sub = await query_one(
            "SELECT * FROM subscriptions WHERE id = $1", subscription_id
        )
        if not sub:
            raise SimpleError("Subscription not found", 404)

        # Payments are one-off Paystack charges, not Paystack subscriptions, so
        # there is nothing to cancel at Paystack: canceling ends access here.
        await query(
            "UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE id = $2",
            "canceled",
            subscription_id,
        )
        await query(
            "UPDATE users SET subscription = $1, paystack_subscription_code = NULL WHERE id = $2",
            "free",
            sub["user_id"],
        )

        await log_action(
            admin_id=admin.user_id,
            action="subscription.cancel",
            target_type="subscription",
            target_id=subscription_id,
            ip_address=client_ip(request),
        )

        return jsjson({"message": "Subscription canceled successfully"})
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Subscription cancel error: {exc}")
        raise SimpleError("Failed to cancel subscription", 500) from None


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}
