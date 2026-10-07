"""Admin data export — port of `routes/admin/export.ts` (2 handlers).

Both handlers stamp the payload with `exportDate: new Date().toISOString()`, which
is volatile, so the parity specs normalise it rather than comparing it.

`POST /domain/:id?format=csv` answers with a CSV body whose `created_at` cells are
ISO 8601 UTC (Express wrote `Date.prototype.toString()`, which spreadsheets do not
parse as a date), and it quotes only `url` — matching the hand-rolled template
literal in the source.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from ...db import query, query_one
from ...errors import SimpleError
from ...json_response import js_iso_datetime, jsjson
from ...logging import create_logger
from ...middleware.admin_auth import AdminUser, admin_auth
from ...services.audit_service import log_action
from ._util import client_ip

log = create_logger("Admin:Export")

router = APIRouter()

CSV_HEADER = "id,type,url,created_at\n"


class _CsvResponse(Response):
    """Placeholder — see `_csv_response` below.

    NOTE: unlike the customer-facing `/api/export/:domainId` route, this handler
    ends with `res.send(string)`, and Express's `res.send` runs `setCharset()` on
    whatever Content-Type is already set. The header on the wire is therefore
    `text/csv; charset=utf-8`, which is exactly what Starlette produces by
    default. The `text/csv`-only override that the other route needs must NOT be
    reused here.
    """


def _csv_response(body: str, filename: str) -> Response:
    """`text/csv; charset=utf-8` plus the attachment filename."""
    return Response(
        content=body,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _js_str(value: Any) -> str:
    """`String(value)` — `null`/`undefined` become the literal text."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _iso_millis() -> str:
    """`new Date().toISOString()`."""
    utc = datetime.now(UTC)
    return utc.strftime("%Y-%m-%dT%H:%M:%S.") + f"{utc.microsecond // 1000:03d}Z"


@router.post("/user/{user_id}")
async def export_user(
    user_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        user = await query_one(
            """
            SELECT id, name, email, subscription, role, created_at
            FROM users WHERE id = $1
            """,
            user_id,
        )

        if not user:
            raise SimpleError("User not found", 404)

        domains = await query("SELECT * FROM domains WHERE user_id = $1", user_id)

        domain_ids = [str(row["id"]) for row in domains]
        events: list[dict] = []
        sessions: list[dict] = []
        recordings: list[dict] = []

        if domain_ids:
            placeholders = ", ".join(f"${i + 1}" for i in range(len(domain_ids)))

            events = await query(
                f"""
                SELECT id, domain_id, type, url, data, created_at
                FROM events WHERE domain_id IN ({placeholders})
                ORDER BY created_at DESC LIMIT 10000
                """,
                *domain_ids,
            )

            sessions = await query(
                f"""
                SELECT id, session_id, domain_id, started_at, ended_at, pageviews,
                       source, source_type, country, city
                FROM sessions WHERE domain_id IN ({placeholders})
                ORDER BY started_at DESC LIMIT 5000
                """,
                *domain_ids,
            )

            recordings = await query(
                f"""
                SELECT id, domain_id, url, duration, events_count, started_at
                FROM session_recordings WHERE domain_id IN ({placeholders})
                ORDER BY started_at DESC LIMIT 1000
                """,
                *domain_ids,
            )

        subscription = await query_one(
            "SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
            user_id,
        )

        await log_action(
            admin_id=admin.user_id,
            action="export.user",
            target_type="user",
            target_id=user_id,
            ip_address=client_ip(request),
        )

        return jsjson(
            {
                "exportDate": _iso_millis(),
                "user": user,
                "subscription": subscription,
                "domains": domains,
                "events": {"count": len(events), "data": events},
                "sessions": {"count": len(sessions), "data": sessions},
                "recordings": {"count": len(recordings), "data": recordings},
            }
        )
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"User export error: {exc}")
        raise SimpleError("Failed to export data", 500) from None


@router.post("/domain/{domain_id}")
async def export_domain(
    domain_id: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        fmt = request.query_params.get("format") or "json"

        domain = await query_one("SELECT * FROM domains WHERE id = $1", domain_id)
        if not domain:
            raise SimpleError("Domain not found", 404)

        events = await query(
            """
            SELECT * FROM events WHERE domain_id = $1
            ORDER BY created_at DESC LIMIT 50000
            """,
            domain_id,
        )

        sessions = await query(
            """
            SELECT * FROM sessions WHERE domain_id = $1
            ORDER BY started_at DESC LIMIT 10000
            """,
            domain_id,
        )

        visitors = await query(
            "SELECT * FROM visitors WHERE domain_id = $1", domain_id
        )

        await log_action(
            admin_id=admin.user_id,
            action="export.domain",
            target_type="domain",
            target_id=domain_id,
            ip_address=client_ip(request),
        )

        if fmt == "csv":
            rows = "\n".join(
                f"{_js_str(event.get('id'))},{_js_str(event.get('type'))},"
                f'"{_js_str(event.get("url"))}",{js_iso_datetime(event["created_at"])}'
                for event in events
            )

            return _csv_response(
                CSV_HEADER + rows,
                f"domain_{domain_id}_events.csv",
            )

        return jsjson(
            {
                "exportDate": _iso_millis(),
                "domain": domain,
                "events": {"count": len(events), "data": events},
                "sessions": {"count": len(sessions), "data": sessions},
                "visitors": {"count": len(visitors), "data": visitors},
            }
        )
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Domain export error: {exc}")
        raise SimpleError("Failed to export domain data", 500) from None
