"""Admin subscriptions and billing — port of `routes/admin/subscriptions.ts`.

Three handlers. `POST /:id/cancel` only talks to Paystack when the owning user has
a `paystack_subscription_code`; the fixture users do not, so the local-cancel path
is the one exercised by the parity specs.
"""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Depends, Request

from ...config import get_settings
from ...db import query, query_one
from ...errors import SimpleError
from ...js_compat import js_parse_int_or_nan
from ...json_response import jsjson
from ...logging import create_logger
from ...middleware.admin_auth import AdminUser, admin_auth
from ...services import plan_catalog
from ...services.audit_service import log_action
from ...validators.admin import update_subscription_schema
from ._util import client_ip

log = create_logger("Admin:Subscriptions")

router = APIRouter()

PAYSTACK_BASE = "https://api.paystack.co"


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

        count_row = await query_one(
            f"SELECT COUNT(*) as count FROM subscriptions s {where}", *args
        )

        revenue = await query(
            """
            SELECT s.plan, COUNT(*) as count,
                   SUM(COALESCE(p.price, 0)) as revenue,
                   COALESCE(p.currency, 'NGN') as currency
            FROM subscriptions s
            LEFT JOIN plans p ON s.plan = p.id
            WHERE s.status = 'active'
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

        user = await query_one("SELECT * FROM users WHERE id = $1", sub["user_id"])
        if not user:
            raise SimpleError("User not found", 404)

        sub_code = user.get("paystack_subscription_code")

        if sub_code:
            log.info(
                f"Canceling Paystack subscription for sub {subscription_id}, code {sub_code}"
            )
            secret = get_settings().PAYSTACK_SECRET_KEY
            if not secret:
                raise RuntimeError("PAYSTACK_SECRET_KEY is missing")

            headers = {"Authorization": f"Bearer {secret}"}
            try:
                async with httpx.AsyncClient(timeout=20) as client:
                    fetched = await client.get(
                        f"{PAYSTACK_BASE}/subscription/{sub_code}", headers=headers
                    )
                    token = (
                        fetched.json().get("data", {}).get("email_token")
                        if fetched.status_code < 400
                        else None
                    )
                    await client.post(
                        f"{PAYSTACK_BASE}/subscription/disable",
                        json={"code": sub_code, "token": token},
                        headers=headers,
                    )
                log.info("Paystack subscription disabled successfully")
            except Exception as exc:  # noqa: BLE001
                # Express surfaces Paystack's own message when it has one.
                message = _paystack_message(exc) or "Failed to cancel at Paystack"
                log.error(f"Failed to disable at Paystack: {message}")
                raise SimpleError(message, 500) from None

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


def _paystack_message(exc: Exception) -> str | None:
    """`err.response?.data?.message` from the axios error shape."""
    response = getattr(exc, "response", None)
    if response is None:
        return None
    try:
        payload = response.json()
    except Exception:
        return None
    message = payload.get("message") if isinstance(payload, dict) else None
    return message if isinstance(message, str) else None


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}
