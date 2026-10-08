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
from ...services import plan_catalog
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
    "team_limit",
    "recordings_per_day",
    "tagline",
    "extra_features",
    "badge",
    "show_on_landing",
)


@router.get("")
@router.get("/")
async def list_plans():
    """Plans as stored, plus what the editor shows alongside: each plan's
    retention (set on the Retention page), its generated pricing bullets, and
    the features a plan can grant."""
    try:
        plans = await query("SELECT * FROM plans ORDER BY sort_order ASC, created_at ASC")
        catalog = list((await plan_catalog.all_plans()).values())
        public = {p.id: plan_catalog.public(p, catalog) for p in catalog}
        return jsjson(
            {
                "plans": [
                    {
                        **plan,
                        "retention": next((p.retention for p in catalog if p.id == plan["id"]), {}),
                        "bullets": public.get(plan["id"], {}).get("bullets", []),
                    }
                    for plan in plans
                ],
                "featureOptions": [
                    {"id": key, "label": label}
                    for key, label in plan_catalog.FEATURE_LABELS.items()
                ],
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error(f"Plans list error: {exc}")
        raise SimpleError("Failed to load plans", 500) from None


@router.post("/preview")
async def preview_plan(request: Request):
    """The pricing-card bullets an unsaved draft would get, so the editor's
    preview uses the same rules as the live pricing pages."""
    body = await _json_body(request)
    data, issues = create_plan_schema(
        {"id": "draft", "name": "Draft", "price": 0, "events_limit": 0, "domains_limit": 0, **body}
    )
    if issues:
        raise SimpleError(issues[0]["message"], 400)
    catalog = await plan_catalog.all_plans()
    existing = catalog.get(body.get("id") or "")
    draft = plan_catalog.PlanDef(
        id=data["id"],
        name=data["name"],
        price=data["price"],
        currency=data["currency"],
        interval=data["interval"],
        events_limit=data["events_limit"],
        domains_limit=data["domains_limit"],
        team_limit=data["team_limit"],
        recordings_per_day=data["recordings_per_day"],
        features=tuple(data["features"]),
        active=data["active"],
        sort_order=data["sort_order"],
        tagline=data["tagline"],
        extra_features=tuple(data["extra_features"]),
        badge=data["badge"],
        show_on_landing=data["show_on_landing"],
        retention=existing.retention if existing else catalog.get("free", draft_free()).retention,
    )
    others = [p for p in catalog.values() if p.id != draft.id]
    return jsjson(plan_catalog.public(draft, [*others, draft]))


def draft_free() -> plan_catalog.PlanDef:
    return plan_catalog.PlanDef(id="free", name="Free", retention={"events": 30})


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
                               domains_limit, retention_days, features, active, sort_order,
                               team_limit, recordings_per_day, tagline, extra_features,
                               badge, show_on_landing)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                    $16, $17) RETURNING *
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
            data["team_limit"],
            data["recordings_per_day"],
            data["tagline"],
            data["extra_features"],
            data["badge"],
            data["show_on_landing"],
        )
        # A retention policy like the free plan's until edited on the Retention
        # page; without a row the retention job would skip this plan's sites.
        await query(
            """
            INSERT INTO data_retention_policies
                (plan, events_days, sessions_days, recordings_days, heatmaps_days)
            SELECT $1, events_days, sessions_days, recordings_days, heatmaps_days
            FROM data_retention_policies WHERE plan = 'free'
            ON CONFLICT (plan) DO NOTHING
            """,
            data["id"],
        )
        plan_catalog.invalidate()

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

        log.info(f"Plan created: {data['id']} by admin {admin.user_id}")
        return jsjson(plan, status_code=201)
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Plan create error: {exc}")
        raise SimpleError("Failed to create plan", 500) from None


@router.put("/{plan_id}")
async def update_plan(plan_id: str, request: Request, admin: AdminUser = Depends(admin_auth)):
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
        plan_catalog.invalidate()

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
