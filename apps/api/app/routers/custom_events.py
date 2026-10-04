"""Custom event analytics routes — port of `routes/customEvents.ts`.

Four read-only aggregations over `events`. Two behaviours are worth calling out:

* Every handler is authenticated AND verifies that the caller owns the `domainId`
  before running its query. The Express original did NOT: it filtered on the
  `domainId` path parameter alone, so any authenticated user could read another
  tenant's custom-event data by supplying that domain's id. That was preserved
  verbatim during the port for parity, and is now fixed. A non-owner receives the
  same 404 as a non-existent domain, so the endpoint cannot be used to probe for
  valid domain ids either.
* `get_date_range` mirrors `parseInt(req.query.days) || 30`, so `days=0` and
  `days=abc` both fall back to 30.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request

from ..db import query, query_one
from ..errors import SimpleError
from ..js_compat import js_parse_int
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..services import domain_service

log = create_logger("CustomEvents")

router = APIRouter()

DEFAULT_RANGE_DAYS = 30

ERROR_LIMIT = 100
BY_PAGE_LIMIT = 20
FORM_LIMIT = 50
RAGE_CLICK_LIMIT = 50

FAILED_ERRORS = "Failed to fetch error data"
FAILED_PERFORMANCE = "Failed to fetch performance data"
FAILED_FORMS = "Failed to fetch form data"
FAILED_RAGE_CLICKS = "Failed to fetch rage click data"


def _parse_date(value: str) -> datetime:
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.now(UTC)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _get_date_range(request: Request) -> tuple[datetime, datetime]:
    """`parseInt(req.query.days) || 30` — 0 and NaN both collapse to the default."""
    days_back = DEFAULT_RANGE_DAYS
    raw_days = request.query_params.get("days")
    if raw_days is not None:
        parsed_days = js_parse_int(raw_days)
        if parsed_days:
            days_back = parsed_days

    raw_end = request.query_params.get("end")
    end = _parse_date(raw_end) if raw_end else datetime.now(UTC)

    raw_start = request.query_params.get("start")
    start = (
        _parse_date(raw_start)
        if raw_start
        else end - timedelta(days=days_back)
    )
    return start, end


async def _require_owned_domain(domain_id: str, user_id: str) -> dict:
    """404 unless the caller owns the domain.

    These routes were the one place in the API that trusted the `domainId` path
    parameter on its own. The same check the other analytics routers apply is used
    here so a foreign domain is indistinguishable from a missing one.
    """
    domain = await domain_service.get_by_id(domain_id)
    if not domain_service.is_owner(domain, user_id):
        raise SimpleError("Domain not found", 404)
    return domain


@router.get("/{domainId}/errors")
async def errors(
    domainId: str, request: Request, user: AuthUser = Depends(require_auth)
):
    try:
        await _require_owned_domain(domainId, user.user_id)
        start, end = _get_date_range(request)

        rows = await query(
            """
            SELECT
                data->>'message' as message,
                data->>'source' as source,
                COUNT(*)::int as count,
                MIN(created_at)::text as first_seen,
                MAX(created_at)::text as last_seen
             FROM events
             WHERE domain_id = $1
               AND type = 'custom'
               AND data->>'event' = 'error'
               AND created_at >= $2
               AND created_at <= $3
             GROUP BY data->>'message', data->>'source'
             ORDER BY count DESC
             LIMIT 100
            """,
            domainId,
            start,
            end,
        )

        total_row = await query_one(
            """
            SELECT COUNT(*)::text as count FROM events
             WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'error'
               AND created_at >= $2 AND created_at <= $3
            """,
            domainId,
            start,
            end,
        )

        trend = await query(
            """
            SELECT date_trunc('day', created_at)::date::text as day, COUNT(*)::int as count
             FROM events
             WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'error'
               AND created_at >= $2 AND created_at <= $3
             GROUP BY day ORDER BY day
            """,
            domainId,
            start,
            end,
        )

        return jsjson(
            {
                "totalErrors": int((total_row or {}).get("count") or "0"),
                "errors": [dict(row) for row in rows],
                "trend": [dict(row) for row in trend],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Error fetching error events: {exc}")
        raise SimpleError(FAILED_ERRORS, 500) from None


@router.get("/{domainId}/performance")
async def performance(
    domainId: str, request: Request, user: AuthUser = Depends(require_auth)
):
    try:
        await _require_owned_domain(domainId, user.user_id)
        start, end = _get_date_range(request)

        metrics = await query_one(
            """
            SELECT
                ROUND(AVG((data->>'lcp')::numeric))::int as avg_lcp,
                ROUND(AVG((data->>'fid')::numeric))::int as avg_fid,
                ROUND(AVG((data->>'cls')::numeric * 1000)) / 1000.0 as avg_cls,
                ROUND(AVG((data->>'ttfb')::numeric))::int as avg_ttfb,
                ROUND(AVG((data->>'fcp')::numeric))::int as avg_fcp,
                ROUND(AVG((data->>'loadTime')::numeric))::int as avg_load_time,
                COUNT(*)::int as sample_count
             FROM events
             WHERE domain_id = $1
               AND type = 'custom'
               AND data->>'event' = 'performance'
               AND created_at >= $2
               AND created_at <= $3
            """,
            domainId,
            start,
            end,
        )

        trend = await query(
            """
            SELECT
                date_trunc('day', created_at)::date::text as day,
                ROUND(AVG((data->>'lcp')::numeric))::int as avg_lcp,
                ROUND(AVG((data->>'fcp')::numeric))::int as avg_fcp
             FROM events
             WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'performance'
               AND created_at >= $2 AND created_at <= $3
             GROUP BY day ORDER BY day
            """,
            domainId,
            start,
            end,
        )

        by_page = await query(
            """
            SELECT
                url,
                ROUND(AVG((data->>'lcp')::numeric))::int as avg_lcp,
                ROUND(AVG((data->>'fcp')::numeric))::int as avg_fcp,
                COUNT(*)::int as count
             FROM events
             WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'performance'
               AND created_at >= $2 AND created_at <= $3
             GROUP BY url
             ORDER BY count DESC
             LIMIT 20
            """,
            domainId,
            start,
            end,
        )

        return jsjson(
            {
                "metrics": dict(metrics) if metrics else None,
                "trend": [dict(row) for row in trend],
                "byPage": [dict(row) for row in by_page],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Error fetching performance data: {exc}")
        raise SimpleError(FAILED_PERFORMANCE, 500) from None


@router.get("/{domainId}/forms")
async def forms(
    domainId: str, request: Request, user: AuthUser = Depends(require_auth)
):
    try:
        await _require_owned_domain(domainId, user.user_id)
        start, end = _get_date_range(request)

        rows = await query(
            """
            SELECT
                data->>'formId' as form_id,
                data->>'formName' as form_name,
                data->>'action' as action,
                data->>'method' as method,
                COUNT(*)::int as submissions,
                ROUND(AVG((data->>'fieldCount')::numeric))::int as avg_fields,
                COUNT(DISTINCT url)::int as pages
             FROM events
             WHERE domain_id = $1
               AND type = 'form'
               AND created_at >= $2
               AND created_at <= $3
             GROUP BY data->>'formId', data->>'formName', data->>'action', data->>'method'
             ORDER BY submissions DESC
             LIMIT 50
            """,
            domainId,
            start,
            end,
        )

        total_row = await query_one(
            """
            SELECT COUNT(*)::text as count FROM events
             WHERE domain_id = $1 AND type = 'form'
               AND created_at >= $2 AND created_at <= $3
            """,
            domainId,
            start,
            end,
        )

        trend = await query(
            """
            SELECT date_trunc('day', created_at)::date::text as day, COUNT(*)::int as count
             FROM events
             WHERE domain_id = $1 AND type = 'form'
               AND created_at >= $2 AND created_at <= $3
             GROUP BY day ORDER BY day
            """,
            domainId,
            start,
            end,
        )

        return jsjson(
            {
                "totalSubmissions": int((total_row or {}).get("count") or "0"),
                "forms": [dict(row) for row in rows],
                "trend": [dict(row) for row in trend],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Error fetching form data: {exc}")
        raise SimpleError(FAILED_FORMS, 500) from None


@router.get("/{domainId}/rage-clicks")
async def rage_clicks(
    domainId: str, request: Request, user: AuthUser = Depends(require_auth)
):
    try:
        await _require_owned_domain(domainId, user.user_id)
        start, end = _get_date_range(request)

        rows = await query(
            """
            SELECT
                data->>'tag' as tag,
                data->>'id' as element_id,
                data->>'text' as text,
                url,
                COUNT(*)::int as count,
                ROUND(AVG((data->>'clickCount')::numeric))::int as avg_click_count
             FROM events
             WHERE domain_id = $1
               AND type = 'custom'
               AND data->>'event' = 'rage_click'
               AND created_at >= $2
               AND created_at <= $3
             GROUP BY data->>'tag', data->>'id', data->>'text', url
             ORDER BY count DESC
             LIMIT 50
            """,
            domainId,
            start,
            end,
        )

        total_row = await query_one(
            """
            SELECT COUNT(*)::text as count FROM events
             WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'rage_click'
               AND created_at >= $2 AND created_at <= $3
            """,
            domainId,
            start,
            end,
        )

        return jsjson(
            {
                "totalRageClicks": int((total_row or {}).get("count") or "0"),
                "rageClicks": [dict(row) for row in rows],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Error fetching rage click data: {exc}")
        raise SimpleError(FAILED_RAGE_CLICKS, 500) from None
