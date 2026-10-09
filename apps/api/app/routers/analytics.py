"""Analytics routes — port of `routes/analytics.ts`.

Two things are easy to get wrong here and are handled deliberately:

1. **Key order.** Each response is built in the same order as the Express object
   literal, because the parity harness compares raw bytes when nothing is
   normalised.
2. **Error messages.** Every Express handler catches its own errors and returns a
   route-specific 500 body, so each handler here does the same rather than falling
   through to the generic handler.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..db import query
from ..errors import SimpleError
from ..js_compat import js_round, url_path
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..services import domain_service, event_service, live_service, session_service

log = create_logger("Analytics")

router = APIRouter()

DEFAULT_RANGE_DAYS = 30
REALTIME_WINDOW_MINUTES = 30
HOUR_INTERVAL_MAX_DAYS = 2
# Comment lines on the live stream, so proxies don't close it as idle
LIVE_HEARTBEAT_SECONDS = 20

SOURCE_TYPES = ("direct", "organic", "paid", "social", "referral", "email")

# Route-specific 500 bodies, matching each Express `res.status(500).json({...})`
FAILED_ANALYTICS = "Failed to get analytics"
FAILED_SOURCES = "Failed to get source data"
FAILED_UTM = "Failed to get UTM data"
FAILED_REALTIME = "Failed to get realtime data"
FAILED_TIMESERIES = "Failed to get timeseries data"
FAILED_DASHBOARD = "Failed to get dashboard data"
FAILED_PAGES = "Failed to get page data"
FAILED_DEVICES = "Failed to get device data"
FAILED_PATHS = "Failed to get paths data"


def _parse_date(value: str) -> datetime:
    """Parse a JS `new Date(string)` equivalent, defaulting to now on failure.

    Date-only strings are treated as UTC midnight, matching JS behaviour.
    """
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.now(UTC)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _get_date_range(start: str | None, end: str | None) -> tuple[datetime, datetime]:
    end_date = _parse_date(end) if end else datetime.now(UTC)
    start_date = (
        _parse_date(start)
        if start
        else end_date - timedelta(days=DEFAULT_RANGE_DAYS)
    )
    return start_date, end_date


async def _require_owned_domain(domain_id: str, user_id: str) -> dict:
    """404 unless the caller owns the domain, matching every analytics handler."""
    domain = await domain_service.get_by_id(domain_id)
    if not domain_service.is_owner(domain, user_id):
        raise SimpleError("Domain not found", 404)
    return domain


def _top_pages_with_paths(rows: list[dict]) -> list[dict]:
    return [{"path": row["path"], "views": row["views"]} for row in rows]


@router.get("/{domainId}/overview")
async def overview(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        pageviews = await event_service.count_by_domain(
            domain["id"], start_date, end_date, "pageview"
        )
        unique_visitors = await event_service.count_unique_visitors(
            domain["id"], start_date, end_date
        )
        total_sessions = await session_service.count_by_domain(
            domain["id"], start_date, end_date
        )
        bounce_rate = await session_service.get_bounce_rate(
            domain["id"], start_date, end_date
        )
        avg_session_duration = await session_service.get_avg_duration(
            domain["id"], start_date, end_date
        )
        top_pages = await event_service.get_top_pages(
            domain["id"], start_date, end_date, 10
        )

        return jsjson(
            {
                "period": {"start": start_date, "end": end_date},
                "metrics": {
                    "pageviews": pageviews,
                    "uniqueVisitors": unique_visitors,
                    "sessions": total_sessions,
                    "bounceRate": bounce_rate,
                    "avgSessionDuration": avg_session_duration,
                },
                "topPages": _top_pages_with_paths(top_pages),
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Analytics overview error: {exc}")
        raise SimpleError(FAILED_ANALYTICS, 500) from None


@router.get("/{domainId}/sources")
async def sources(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        source_types = await session_service.get_source_type_breakdown(
            domain["id"], start_date, end_date
        )
        top_referrers = await session_service.get_top_referrers(
            domain["id"], start_date, end_date, 20, domain.get("domain")
        )

        breakdown: dict[str, int] = {name: 0 for name in SOURCE_TYPES}
        for row in source_types:
            breakdown[row["source_type"]] = row["count"]

        return jsjson(
            {
                "period": {"start": start_date, "end": end_date},
                "byType": breakdown,
                "topSources": [
                    {
                        "source": row["site"],
                        "sessions": row["sessions"],
                        "visits": row["sessions"],  # older clients read `visits`
                        "visitors": row["visitors"],
                    }
                    for row in top_referrers
                ],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Analytics sources error: {exc}")
        raise SimpleError(FAILED_SOURCES, 500) from None


@router.get("/{domainId}/utm")
async def utm(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        breakdown = await event_service.get_source_breakdown(
            domain["id"], start_date, end_date
        )

        # NOTE: `campaigns` is never populated — the Express loop only fills
        # `sources`, so campaigns always serialises as []. Reproduced faithfully.
        campaigns: dict[str, int] = {}
        utm_sources: dict[str, int] = {}
        for row in breakdown:
            if row["utm_source"]:
                utm_sources[row["utm_source"]] = (
                    utm_sources.get(row["utm_source"], 0) + row["count"]
                )

        def _sorted_entries(values: dict[str, int]) -> list[dict]:
            return [
                {"name": name, "count": count}
                for name, count in sorted(values.items(), key=lambda item: -item[1])
            ]

        return jsjson(
            {
                "period": {"start": start_date, "end": end_date},
                "campaigns": _sorted_entries(campaigns),
                "sources": _sorted_entries(utm_sources),
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Analytics UTM error: {exc}")
        raise SimpleError(FAILED_UTM, 500) from None


@router.get("/{domainId}/live")
async def live(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    """Server-sent events: an `update` each time the domain stores new events.

    The event carries no data; the dashboard re-fetches through the routes below.
    """
    domain = await _require_owned_domain(domainId, user.user_id)

    async def stream():
        with live_service.subscribe(domain["id"]) as updates:
            yield "retry: 5000\n\n"
            while not await request.is_disconnected():
                try:
                    await asyncio.wait_for(updates.get(), timeout=LIVE_HEARTBEAT_SECONDS)
                    yield "event: update\ndata: {}\n\n"
                except TimeoutError:
                    yield ": ping\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{domainId}/realtime")
async def realtime(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        active_visitors = await event_service.count_realtime_visitors(
            domain["id"], REALTIME_WINDOW_MINUTES
        )
        recent_events = await event_service.get_recent_events(
            domain["id"], REALTIME_WINDOW_MINUTES
        )

        pageviews_last_30_min = sum(
            1 for event in recent_events if event["type"] == "pageview"
        )

        page_map: dict[str, int] = {}
        for event in recent_events:
            if event["type"] == "pageview":
                path = url_path(event["url"])
                page_map[path] = page_map.get(path, 0) + 1

        active_pages = [
            {"path": path, "count": count}
            for path, count in sorted(page_map.items(), key=lambda item: -item[1])[:10]
        ]

        return jsjson(
            {
                "activeVisitors": active_visitors,
                "pageviewsLast30Min": pageviews_last_30_min,
                "activePages": active_pages,
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Analytics realtime error: {exc}")
        raise SimpleError(FAILED_REALTIME, 500) from None


@router.get("/{domainId}/timeseries")
async def timeseries(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        # JS compares Date.getTime() deltas in milliseconds; seconds/86400 is the
        # same figure without the intermediate multiply-by-1000 round trip
        diff_days = (end_date - start_date).total_seconds() / 86_400
        interval = "hour" if diff_days <= HOUR_INTERVAL_MAX_DAYS else "day"

        data = await event_service.get_timeseries(
            domain["id"], start_date, end_date, interval
        )

        return jsjson(
            {
                "period": {"start": start_date, "end": end_date},
                "interval": interval,
                "data": [
                    {
                        "date": row["bucket"],
                        "pageviews": row["pageviews"],
                        "visitors": row["visitors"],
                        "sessions": row["sessions"],
                    }
                    for row in data
                ],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Analytics timeseries error: {exc}")
        raise SimpleError(FAILED_TIMESERIES, 500) from None


@router.get("/{domainId}/dashboard")
async def dashboard(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        pageviews = await event_service.count_by_domain(
            domain["id"], start_date, end_date, "pageview"
        )
        unique_visitors = await event_service.count_unique_visitors(
            domain["id"], start_date, end_date
        )
        total_sessions = await session_service.count_by_domain(
            domain["id"], start_date, end_date
        )
        bounce_rate = await session_service.get_bounce_rate(
            domain["id"], start_date, end_date
        )
        avg_session_duration = await session_service.get_avg_duration(
            domain["id"], start_date, end_date
        )
        top_pages = await event_service.get_top_pages(
            domain["id"], start_date, end_date, 10
        )
        # Called without an interval, so the service default ('day') applies
        series = await event_service.get_timeseries(domain["id"], start_date, end_date)
        source_types = await session_service.get_source_type_breakdown(
            domain["id"], start_date, end_date
        )
        active_visitors = await event_service.count_realtime_visitors(
            domain["id"], REALTIME_WINDOW_MINUTES
        )

        source_breakdown: dict[str, int] = {name: 0 for name in SOURCE_TYPES}
        for row in source_types:
            source_breakdown[row["source_type"]] = row["count"]

        return jsjson(
            {
                "period": {"start": start_date, "end": end_date},
                "metrics": {
                    "pageviews": pageviews,
                    "uniqueVisitors": unique_visitors,
                    "sessions": total_sessions,
                    "bounceRate": bounce_rate,
                    "avgSessionDuration": avg_session_duration,
                },
                "topPages": _top_pages_with_paths(top_pages),
                "timeseries": [
                    {
                        "date": row["bucket"],
                        "pageviews": row["pageviews"],
                        "visitors": row["visitors"],
                        "sessions": row["sessions"],
                    }
                    for row in series
                ],
                "sources": source_breakdown,
                "realtime": {"activeVisitors": active_visitors},
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Analytics dashboard error: {exc}")
        raise SimpleError(FAILED_DASHBOARD, 500) from None


@router.get("/{domainId}/pages")
async def pages(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        stats = await event_service.get_page_stats(domain["id"], start_date, end_date, 50)

        return jsjson(
            {
                "period": {"start": start_date, "end": end_date},
                "pages": [
                    {
                        "path": row["path"],
                        "views": row["views"],  # older clients read `views`
                        "pageviews": row["views"],
                        "avgTime": row["avg_seconds"],
                        "entries": row["entries"],
                        "exits": row["exits"],
                        "bounceRate": (
                            round(row["bounces"] / row["entries"] * 100, 1)
                            if row["entries"]
                            else 0
                        ),
                    }
                    for row in stats
                ],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Analytics pages error: {exc}")
        raise SimpleError(FAILED_PAGES, 500) from None


@router.get("/{domainId}/devices")
async def devices(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        device_rows = await query(
            f"""
            SELECT
                {session_service.device_case_sql("s.screen_width")} AS device,
                COUNT(DISTINCT s.session_id)::int AS count
            FROM sessions s
            WHERE s.domain_id = $1 AND s.started_at >= $2 AND s.started_at <= $3
            GROUP BY 1
            ORDER BY count DESC
            """,
            domain["id"],
            start_date,
            end_date,
        )

        browser_rows = await query(
            """
            SELECT
                CASE
                    WHEN s.user_agent ILIKE '%Edg/%' OR s.user_agent ILIKE '%Edge/%' THEN 'Edge'
                    WHEN s.user_agent ILIKE '%OPR/%' OR s.user_agent ILIKE '%Opera%' THEN 'Opera'
                    WHEN s.user_agent ILIKE '%Firefox/%' THEN 'Firefox'
                    WHEN s.user_agent ILIKE '%Chrome/%'
                         AND s.user_agent NOT ILIKE '%Chromium%' THEN 'Chrome'
                    WHEN s.user_agent ILIKE '%Safari/%'
                         AND s.user_agent NOT ILIKE '%Chrome%' THEN 'Safari'
                    WHEN s.user_agent ILIKE '%Chromium%' THEN 'Chromium'
                    WHEN s.user_agent IS NULL THEN 'Unknown'
                    ELSE 'Other'
                END AS browser,
                COUNT(DISTINCT s.session_id)::int AS count
            FROM sessions s
            WHERE s.domain_id = $1 AND s.started_at >= $2 AND s.started_at <= $3
            GROUP BY 1
            ORDER BY count DESC
            """,
            domain["id"],
            start_date,
            end_date,
        )

        os_rows = await query(
            """
            SELECT
                CASE
                    WHEN s.user_agent ILIKE '%Windows%' THEN 'Windows'
                    WHEN s.user_agent ILIKE '%iPhone%' OR s.user_agent ILIKE '%iPad%' THEN 'iOS'
                    WHEN s.user_agent ILIKE '%Macintosh%'
                         OR s.user_agent ILIKE '%Mac OS%' THEN 'macOS'
                    WHEN s.user_agent ILIKE '%Android%' THEN 'Android'
                    WHEN s.user_agent ILIKE '%Linux%' THEN 'Linux'
                    WHEN s.user_agent IS NULL THEN 'Unknown'
                    ELSE 'Other'
                END AS os,
                COUNT(DISTINCT s.session_id)::int AS count
            FROM sessions s
            WHERE s.domain_id = $1 AND s.started_at >= $2 AND s.started_at <= $3
            GROUP BY 1
            ORDER BY count DESC
            """,
            domain["id"],
            start_date,
            end_date,
        )

        # Percentages for all three lists are computed against the DEVICE total.
        # That is what the Express implementation does, quirk included.
        total = sum(row["count"] for row in device_rows) or 1

        def _percentage(count: int) -> int:
            return js_round((count / total) * 100)

        return jsjson(
            {
                "period": {"start": start_date, "end": end_date},
                "devices": [
                    {
                        # `charAt(0).toUpperCase() + slice(1)`
                        "name": row["device"][:1].upper() + row["device"][1:],
                        "sessions": row["count"],
                        "percentage": _percentage(row["count"]),
                    }
                    for row in device_rows
                ],
                "browsers": [
                    {
                        "name": row["browser"],
                        "sessions": row["count"],
                        "percentage": _percentage(row["count"]),
                    }
                    for row in browser_rows
                ],
                "operatingSystems": [
                    {
                        "name": row["os"],
                        "sessions": row["count"],
                        "percentage": _percentage(row["count"]),
                    }
                    for row in os_rows
                ],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Analytics devices error: {exc}")
        raise SimpleError(FAILED_DEVICES, 500) from None


@router.get("/{domainId}/paths")
async def paths(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        flows, entries_and_exits = (
            await event_service.get_user_paths(domain["id"], start_date, end_date, 20),
            await event_service.get_entries_and_exits(
                domain["id"], start_date, end_date, 20
            ),
        )

        total_flows = sum(flow["count"] for flow in flows) or 1

        entries = [
            {"path": row["url"], "count": row["count"]}
            for row in entries_and_exits
            if row["is_entry"]
        ][:5]
        exits = [
            {"path": row["url"], "count": row["count"]}
            for row in entries_and_exits
            if row["is_exit"]
        ][:5]

        return jsjson(
            {
                "period": {"start": start_date, "end": end_date},
                "flows": [
                    {
                        "from": flow["source_url"],
                        "to": flow["target_url"],
                        "count": flow["count"],
                        "percentage": js_round((flow["count"] / total_flows) * 100),
                    }
                    for flow in flows
                ],
                "entries": entries,
                "exits": exits,
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Analytics paths error: {exc}")
        raise SimpleError(FAILED_PATHS, 500) from None
