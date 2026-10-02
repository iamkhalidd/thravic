"""Admin data-retention policies — port of `routes/admin/retention.ts` (3 handlers).

Note the `PUT /:plan` handler performs **no validation** — `validators/admin.ts`
exports an `updateRetentionSchema` but the route never imports it, reading
`req.body` directly instead. Ported as-is, so a non-numeric `events_days` reaches
Postgres and fails as a 500 rather than a 400.
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

        # How much data each policy would currently remove.
        stats: list[dict[str, Any]] = []
        for policy in policies:
            expired = await query_one(
                """
                SELECT COUNT(*) as count FROM events e
                JOIN domains d ON e.domain_id = d.id
                JOIN users u ON d.user_id = u.id
                WHERE u.subscription = $1
                AND e.created_at < NOW() - INTERVAL '1 day' * $2::int
                """,
                policy["plan"],
                policy["events_days"],
            )
            stats.append({**policy, "expiredEventsCount": _count(expired)})

        return jsjson({"policies": stats})
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
        policies = await query("SELECT * FROM data_retention_policies")
        results: dict[str, dict[str, int]] = {}

        for policy in policies:
            events_result = await query(
                """
                DELETE FROM events WHERE id IN (
                    SELECT e.id FROM events e
                    JOIN domains d ON e.domain_id = d.id
                    JOIN users u ON d.user_id = u.id
                    WHERE u.subscription = $1
                    AND e.created_at < NOW() - INTERVAL '1 day' * $2::int
                ) RETURNING id
                """,
                policy["plan"],
                policy["events_days"],
            )

            sessions_result = await query(
                """
                DELETE FROM sessions WHERE id IN (
                    SELECT s.id FROM sessions s
                    JOIN domains d ON s.domain_id = d.id
                    JOIN users u ON d.user_id = u.id
                    WHERE u.subscription = $1
                    AND s.started_at < NOW() - INTERVAL '1 day' * $2::int
                ) RETURNING id
                """,
                policy["plan"],
                policy["sessions_days"],
            )

            recordings_result = await query(
                """
                DELETE FROM session_recordings WHERE id IN (
                    SELECT sr.id FROM session_recordings sr
                    JOIN domains d ON sr.domain_id = d.id
                    JOIN users u ON d.user_id = u.id
                    WHERE u.subscription = $1
                    AND sr.started_at < NOW() - INTERVAL '1 day' * $2::int
                ) RETURNING id
                """,
                policy["plan"],
                policy["recordings_days"],
            )

            heatmaps_result = await query(
                """
                DELETE FROM heatmap_data WHERE id IN (
                    SELECT h.id FROM heatmap_data h
                    JOIN domains d ON h.domain_id = d.id
                    JOIN users u ON d.user_id = u.id
                    WHERE u.subscription = $1
                    AND h.created_at < NOW() - INTERVAL '1 day' * $2::int
                ) RETURNING id
                """,
                policy["plan"],
                policy["heatmaps_days"],
            )

            results[policy["plan"]] = {
                "events": len(events_result),
                "sessions": len(sessions_result),
                "recordings": len(recordings_result),
                "heatmaps": len(heatmaps_result),
            }

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
