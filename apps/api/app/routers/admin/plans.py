"""Admin plan CRUD — port of `routes/admin/plans.ts` (3 handlers).

The validators for this file are declared inline in the Express route rather than
in `validators/admin.ts`; they live in `validators/admin.py` here.

These routes carry **no** `adminAuth` of their own — they rely entirely on the
global check applied in `routes/admin/index.ts`, which `routers/admin/__init__.py`
mirrors. Do not move that dependency into the sub-routers.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request

from ...db import query, query_one
from ...errors import SimpleError
from ...json_response import jsjson
from ...logging import create_logger
from ...middleware.admin_auth import AdminUser, admin_auth
from ...services.audit_service import log_action
from ...validators.admin import create_plan_schema, update_plan_schema
from ._util import client_ip

log = create_logger("Admin:Plans")

router = APIRouter()

UPDATE_FIELDS = (
    "name",
    "price",
    "currency",
    "interval",
    "events_limit",
    "domains_limit",
    "retention_days",
    "features",
    "active",
    "sort_order",
)


@router.get("")
@router.get("/")
async def list_plans():
    try:
        plans = await query(
            "SELECT * FROM plans ORDER BY sort_order ASC, created_at ASC"
        )
        return jsjson({"plans": plans})
    except Exception as exc:  # noqa: BLE001
        log.error(f"Plans list error: {exc}")
        raise SimpleError("Failed to load plans", 500) from None


@router.post("")
@router.post("/")
async def create_plan(request: Request, admin: AdminUser = Depends(admin_auth)):
    try:
        body = await _json_body(request)
        data, issues = create_plan_schema(body)
        if issues:
            raise SimpleError(issues[0]["message"], 400)

        existing = await query_one("SELECT id FROM plans WHERE id = $1", data["id"])
        if existing:
            raise SimpleError(f'Plan "{data["id"]}" already exists', 409)

        plan = await query_one(
            """
            INSERT INTO plans (id, name, price, currency, interval, events_limit,
                               domains_limit, retention_days, features, active, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
            """,
            data["id"],
            data["name"],
            data["price"],
            data["currency"],
            data["interval"],
            data["events_limit"],
            data["domains_limit"],
            data["retention_days"],
            data["features"],
            data["active"],
            data["sort_order"],
        )

        await log_action(
            admin_id=admin.user_id,
            action="plan.create",
            target_type="plan",
            # NOTE: `plans.id` is VARCHAR while `admin_audit_log.target_id` is UUID,
            # so this insert fails and is swallowed. Faithful to Express — the
            # `plan.create` action is simply absent from the audit trail.
            target_id=data["id"],
            details=data,
            ip_address=client_ip(request),
        )

        log.info(f'Plan created: {data["id"]} by admin {admin.user_id}')
        return jsjson(plan, status_code=201)
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Plan create error: {exc}")
        raise SimpleError("Failed to create plan", 500) from None


@router.put("/{plan_id}")
async def update_plan(
    plan_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        body = await _json_body(request)
        data, issues = update_plan_schema(body)
        if issues:
            raise SimpleError(issues[0]["message"], 400)

        updates: list[str] = []
        args: list[Any] = []
        index = 1

        for field in UPDATE_FIELDS:
            if field in data:
                updates.append(f"{field} = ${index}")
                args.append(data[field])
                index += 1

        if not updates:
            raise SimpleError("No fields to update", 400)

        updates.append("updated_at = NOW()")
        args.append(plan_id)

        plan = await query_one(
            f"UPDATE plans SET {', '.join(updates)} WHERE id = ${index} RETURNING *",
            *args,
        )

        if not plan:
            raise SimpleError("Plan not found", 404)

        await log_action(
            admin_id=admin.user_id,
            action="plan.update",
            target_type="plan",
            target_id=plan_id,
            details=data,
            ip_address=client_ip(request),
        )

        log.info(f"Plan updated: {plan_id} by admin {admin.user_id}")
        return jsjson(plan)
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Plan update error: {exc}")
        raise SimpleError("Failed to update plan", 500) from None


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}
