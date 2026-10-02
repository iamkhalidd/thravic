"""Admin promo-code CRUD — port of `routes/admin/promos.ts` (5 handlers).

Like `plans.py`, these routes declare no per-route auth and depend on the global
`adminAuth` from `routes/admin/index.ts`.

`starts_at` / `expires_at` arrive as ISO strings. node-postgres forwards a string
and lets Postgres cast it, but asyncpg requires a real `datetime`, so they are
parsed on the way in. Zod has already validated the format, so a parse failure
here would mean the validator and the DB disagree.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request

from ...db import query, query_one
from ...errors import SimpleError
from ...json_response import jsjson
from ...logging import create_logger
from ...middleware.admin_auth import AdminUser, admin_auth
from ...services.audit_service import log_action
from ...validators.admin import create_promo_schema, update_promo_schema
from ._util import client_ip

log = create_logger("Admin:Promos")

router = APIRouter()

UPDATE_FIELDS = (
    "code",
    "discount_type",
    "discount_value",
    "applicable_plans",
    "max_uses",
    "max_per_user",
    "starts_at",
    "expires_at",
    "active",
)


def _timestamp(value: Any) -> datetime | None:
    """Turn a validated ISO string into a `datetime`; pass `None` through."""
    if value is None or isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


@router.get("")
@router.get("/")
async def list_promos():
    try:
        promos = await query(
            """
            SELECT pc.*,
                   COUNT(pr.id) as total_redemptions,
                   COALESCE(SUM(pr.original_amount - pr.discounted_amount), 0)
                       as total_discount_given
            FROM promo_codes pc
            LEFT JOIN promo_redemptions pr ON pc.id = pr.promo_code_id
            GROUP BY pc.id
            ORDER BY pc.created_at DESC
            """
        )
        return jsjson({"promos": promos})
    except Exception as exc:  # noqa: BLE001
        log.error(f"Promos list error: {exc}")
        raise SimpleError("Failed to load promo codes", 500) from None


@router.get("/{promo_id}")
async def promo_detail(promo_id: str):
    try:
        promo = await query_one(
            "SELECT * FROM promo_codes WHERE id = $1", promo_id
        )
        if not promo:
            raise SimpleError("Promo not found", 404)

        redemptions = await query(
            """
            SELECT pr.*, u.name as user_name, u.email as user_email
            FROM promo_redemptions pr
            LEFT JOIN users u ON pr.user_id = u.id
            WHERE pr.promo_code_id = $1
            ORDER BY pr.created_at DESC
            LIMIT 100
            """,
            promo_id,
        )

        return jsjson({"promo": promo, "redemptions": redemptions})
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Promo detail error: {exc}")
        raise SimpleError("Failed to load promo details", 500) from None


@router.post("")
@router.post("/")
async def create_promo(request: Request, admin: AdminUser = Depends(admin_auth)):
    try:
        body = await _json_body(request)
        data, issues = create_promo_schema(body)
        if issues:
            raise SimpleError(issues[0]["message"], 400)

        existing = await query_one(
            "SELECT id FROM promo_codes WHERE code = $1", data["code"]
        )
        if existing:
            raise SimpleError(f'Promo code "{data["code"]}" already exists', 409)

        promo = await query_one(
            """
            INSERT INTO promo_codes
                (code, discount_type, discount_value, applicable_plans, max_uses, max_per_user,
                 starts_at, expires_at, active, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
            """,
            data["code"],
            data["discount_type"],
            data["discount_value"],
            data["applicable_plans"],
            # `data.max_uses || null` and friends: an explicit `null`, a `0` and a
            # missing key all collapse to SQL NULL.
            data.get("max_uses") or None,
            data["max_per_user"],
            _timestamp(data.get("starts_at")) or None,
            _timestamp(data.get("expires_at")) or None,
            data["active"],
            admin.user_id,
        )

        await log_action(
            admin_id=admin.user_id,
            action="promo.create",
            target_type="promo",
            details={
                "code": data["code"],
                "discount_type": data["discount_type"],
                "discount_value": data["discount_value"],
            },
            ip_address=client_ip(request),
        )

        log.info(f'Promo created: {data["code"]} by admin {admin.user_id}')
        return jsjson(promo, status_code=201)
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Promo create error: {exc}")
        raise SimpleError("Failed to create promo code", 500) from None


@router.put("/{promo_id}")
async def update_promo(
    promo_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        body = await _json_body(request)
        data, issues = update_promo_schema(body)
        if issues:
            raise SimpleError(issues[0]["message"], 400)

        updates: list[str] = []
        args: list[Any] = []
        index = 1

        for field in UPDATE_FIELDS:
            # `!== undefined`, so an explicit `null` clears the column.
            if field in data:
                value = data[field]
                if field in ("starts_at", "expires_at"):
                    value = _timestamp(value)
                updates.append(f"{field} = ${index}")
                args.append(value)
                index += 1

        if not updates:
            raise SimpleError("No fields to update", 400)

        args.append(promo_id)
        promo = await query_one(
            f"UPDATE promo_codes SET {', '.join(updates)} WHERE id = ${index} RETURNING *",
            *args,
        )

        if not promo:
            raise SimpleError("Promo not found", 404)

        await log_action(
            admin_id=admin.user_id,
            action="promo.update",
            target_type="promo",
            target_id=promo_id,
            details=data,
            ip_address=client_ip(request),
        )

        return jsjson(promo)
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Promo update error: {exc}")
        raise SimpleError("Failed to update promo code", 500) from None


@router.delete("/{promo_id}")
async def delete_promo(
    promo_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        # A soft delete — the row is kept and only deactivated.
        promo = await query_one(
            "UPDATE promo_codes SET active = false WHERE id = $1 RETURNING *",
            promo_id,
        )
        if not promo:
            raise SimpleError("Promo not found", 404)

        await log_action(
            admin_id=admin.user_id,
            action="promo.delete",
            target_type="promo",
            target_id=promo_id,
            ip_address=client_ip(request),
        )

        return jsjson({"message": "Promo code deactivated"})
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Promo delete error: {exc}")
        raise SimpleError("Failed to deactivate promo code", 500) from None


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}
