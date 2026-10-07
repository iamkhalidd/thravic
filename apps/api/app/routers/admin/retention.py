"""Admin data-retention policies — port of `routes/admin/retention.ts` (3 handlers).

Expired counts and cleanup go through `retention_service`, shared with the daily
retention job (`jobs/retention.py`). Cleanup results are totals across plans.

Note the `PUT /:plan` handler performs **no validation** — `validators/admin.ts`
exports an `updateRetentionSchema` but the route never imports it, reading
`req.body` directly instead. Ported as-is, so a non-numeric `events_days` reaches
Postgres and fails as a 500 rather than a 400.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request

from ...config import get_settings
from ...db import query, query_one
from ...errors import SimpleError
from ...json_response import jsjson
from ...logging import create_logger
from ...middleware.admin_auth import AdminUser, admin_auth
from ...services import retention_service
from ...services.audit_service import log_action
from ._util import client_ip

log = create_logger("Admin:Retention")

router = APIRouter()


def _count(row: dict | None) -> int:
    return int((row or {}).get("count") or 0)


@router.get("")
@router.get("/")
async def list_policies():
    try:
        policies = await query(
            "SELECT * FROM data_retention_policies ORDER BY events_days ASC"
        )

        # How much data each policy would currently remove — the same count the
        # daily retention job reports, so the two can be compared directly.
        report = await retention_service.expired_counts()
        stats: list[dict[str, Any]] = [
            {
                **policy,
                "expiredEventsCount": report["byPlan"].get(policy["plan"], {}).get("events", 0),
            }
            for policy in policies
        ]
        last_run = await query_one(
            "SELECT last_run_at, details FROM job_runs WHERE name = 'retention'"
        )

        return jsjson(
            {
                "policies": stats,
                "fromInactivePaidOwners": report["fromInactivePaidOwners"],
                "mode": get_settings().RETENTION_MODE,
                "lastRun": last_run,
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error(f"Retention list error: {exc}")
        raise SimpleError("Failed to load retention policies", 500) from None


@router.put("/{plan}")
async def update_policy(
    plan: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        body = await _json_body(request)

        policy = await query_one(
            """
            UPDATE data_retention_policies
            SET events_days = COALESCE($1, events_days),
                sessions_days = COALESCE($2, sessions_days),
                recordings_days = COALESCE($3, recordings_days),
                heatmaps_days = COALESCE($4, heatmaps_days)
            WHERE plan = $5
            RETURNING *
            """,
            body.get("events_days"),
            body.get("sessions_days"),
            body.get("recordings_days"),
            body.get("heatmaps_days"),
            plan,
        )

        if not policy:
            raise SimpleError("Plan not found", 404)

        await log_action(
            admin_id=admin.user_id,
            action="retention.update",
            target_type="retention",
            details={"plan": plan, **body},
            ip_address=client_ip(request),
        )

        return jsjson(policy)
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Retention update error: {exc}")
        raise SimpleError("Failed to update retention policy", 500) from None


@router.post("/cleanup")
async def run_cleanup(request: Request, admin: AdminUser = Depends(admin_auth)):
    try:
        # Batched, and plans resolved as for billing (see retention_service).
        results = await retention_service.delete_expired()

        await log_action(
            admin_id=admin.user_id,
            action="retention.cleanup",
            target_type="system",
            details={"results": results},
            ip_address=client_ip(request),
        )

        return jsjson({"message": "Cleanup completed", "results": results})
    except Exception as exc:  # noqa: BLE001
        log.error(f"Cleanup error: {exc}")
        raise SimpleError("Failed to run cleanup", 500) from None


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}
