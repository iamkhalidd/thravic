"""Admin event explorer and bulk purge — port of `routes/admin/events.ts` (2 handlers)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request

from ...db import query, query_one
from ...errors import SimpleError
from ...js_compat import js_parse_int_or_nan
from ...json_response import jsjson
from ...logging import create_logger
from ...middleware.admin_auth import AdminUser, admin_auth
from ...services.audit_service import log_action
from ...validators.admin import purge_events_schema
from ._util import client_ip

log = create_logger("Admin:Events")

router = APIRouter()


def _count(row: dict[str, Any] | None) -> int:
    return int((row or {}).get("count") or 0)


@router.get("")
@router.get("/")
async def list_events(request: Request):
    try:
        params = request.query_params
        domain_id = params.get("domainId") or ""
        event_type = params.get("type") or ""
        url = params.get("url") or ""
        # NOTE: `Math.min(parseInt(...), 200)` has no fallback, so a malformed value
        # is NaN and Postgres rejects it — the request ends as a 500, not a 400.
        limit = min(js_parse_int_or_nan(params.get("limit") or "50"), 200)
        offset = js_parse_int_or_nan(params.get("offset") or "0")

        conditions: list[str] = []
        args: list[Any] = []
        index = 1

        if domain_id:
            conditions.append(f"e.domain_id = ${index}")
            args.append(domain_id)
            index += 1
        if event_type:
            conditions.append(f"e.type = ${index}")
            args.append(event_type)
            index += 1
        if url:
            conditions.append(f"e.url ILIKE ${index}")
            args.append(f"%{url}%")
            index += 1

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        events = await query(
            f"""
            SELECT e.*, d.domain as domain_name
            FROM events e
            LEFT JOIN domains d ON e.domain_id = d.id
            {where}
            ORDER BY e.created_at DESC
            LIMIT ${index} OFFSET ${index + 1}
            """,
            *args,
            limit,
            offset,
        )

        count_row = await query_one(
            f"SELECT COUNT(*) as count FROM events e {where}", *args
        )

        return jsjson(
            {
                "events": events,
                "total": _count(count_row),
                "limit": limit,
                "offset": offset,
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error(f"Events list error: {exc}")
        raise SimpleError("Failed to load events", 500) from None


@router.delete("/purge")
async def purge_events(request: Request, admin: AdminUser = Depends(admin_auth)):
    try:
        body = await _json_body(request)
        data, issues = purge_events_schema(body)
        if issues:
            raise SimpleError(issues[0]["message"], 400)

        domain_id = data.get("domainId")
        before = data.get("before")
        event_type = data.get("type")

        conditions: list[str] = []
        args: list[Any] = []
        index = 1

        if domain_id:
            conditions.append(f"domain_id = ${index}")
            args.append(domain_id)
            index += 1
        if before:
            conditions.append(f"created_at < ${index}")
            args.append(_timestamp(before))
            index += 1
        if event_type:
            conditions.append(f"type = ${index}")
            args.append(event_type)
            index += 1

        where = " AND ".join(conditions)

        count_row = await query_one(
            f"SELECT COUNT(*) as count FROM events WHERE {where}", *args
        )

        await query(f"DELETE FROM events WHERE {where}", *args)

        deleted = _count(count_row)

        await log_action(
            admin_id=admin.user_id,
            action="events.purge",
            target_type="events",
            details={
                "domainId": domain_id,
                "before": before,
                "type": event_type,
                "deletedCount": deleted,
            },
            ip_address=client_ip(request),
        )

        return jsjson({"message": f"Purged {deleted} events", "deleted": deleted})
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Events purge error: {exc}")
        raise SimpleError("Failed to purge events", 500) from None


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}


def _timestamp(value: str) -> datetime:
    """Parse the `before` filter into a real datetime.

    node-postgres forwards the string and lets Postgres cast it, but asyncpg
    requires a `datetime` — without this, every purge with a date filter failed
    with "expected a datetime.date or datetime.datetime instance".

    An unparseable value raises, which the handler turns into a 500. That matches
    Express: Postgres rejects the bad literal and the route's catch answers 500.
    """
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"invalid before date: {value!r}") from exc
