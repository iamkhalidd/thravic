"""Heatmap routes — port of `routes/heatmaps.ts`.

Both handlers are gated by `requireFeature('heatmaps')`, which runs *before* the
domain lookup, so a free-plan caller gets 403 rather than 404.

`?startDate=&endDate=` is the dashboard's date range (the last 30 days without
it). `?viewport=desktop|tablet|mobile` limits the heatmap to sessions of that device
class (by screen width, as in the analytics devices breakdown). Omitted means all.

Click points are whole percentages of the page (x of the viewport width, y of the
document height), so clicks from different screen sizes land on one canvas.
Scroll points are the number of page visitors reaching each 25% depth milestone.
"""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query, Request

from ..date_range import date_range
from ..errors import SimpleError
from ..js_compat import js_round, url_path
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
from ..services import domain_service, event_service, session_service

log = create_logger("Heatmaps")

router = APIRouter()

LOOKBACK_DAYS = 30
PAGE_LIMIT = 20
SCROLL_MILESTONES = (25, 50, 75, 100)

FAILED_HEATMAP = "Failed to get heatmap data"
FAILED_PAGES = "Failed to get heatmap pages"


async def _require_owned_domain(domain_id: str, user_id: str) -> dict:
    domain = await domain_service.get_by_id(domain_id)
    if not domain_service.is_owner(domain, user_id):
        raise SimpleError("Domain not found", 404)
    return domain


def _absolute_path(url: str) -> str | None:
    """Return the pathname of an absolute URL, or None when it cannot be parsed.

    Express wraps `new URL(e.url).pathname` in a try/catch that skips the event
    entirely on failure, so a non-absolute URL must be dropped rather than kept.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
    return parsed.path or "/"


def _numeric(value: object) -> float | None:
    """Coerce a JSONB value to a float, mirroring JS `Number` coercion leniently."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _percent(value: float, of: float) -> int:
    """`value` as a whole percentage of `of`, clamped to the 0-100 canvas."""
    return max(0, min(100, js_round(value / of * 100)))


def _click_points(events: list[dict]) -> tuple[list[dict], int]:
    """Bucket clicks into whole-percent cells of the page, busiest first.

    Clicks recorded before the tracker sent `viewportWidth`, `pageY` and
    `docHeight` cannot be placed (their `x`/`y` are viewport pixels with no size to
    relate them to); they are counted and returned separately.
    """
    point_map: dict[tuple[int, int], dict] = {}
    unplaced = 0
    for event in events:
        data = event.get("data") or {}
        if not isinstance(data, dict):
            continue
        x, page_y = _numeric(data.get("x")), _numeric(data.get("pageY"))
        width, height = _numeric(data.get("viewportWidth")), _numeric(data.get("docHeight"))
        if x is None or page_y is None or not width or not height:
            unplaced += 1
            continue
        cell = (_percent(x, width), _percent(page_y, height))
        entry = point_map.setdefault(cell, {"x": cell[0], "y": cell[1], "count": 0})
        entry["count"] += 1

    return sorted(point_map.values(), key=lambda item: -item["count"]), unplaced


def _scroll_points(events: list[dict]) -> list[dict]:
    """Visitors reaching each depth milestone: `{x: 0, y: depth, count}`.

    The tracker reports each 25% milestone once per page view, so a visitor counts
    toward every milestone up to the deepest one they reported.
    """
    deepest: dict[object, float] = {}
    for event in events:
        data = event.get("data") or {}
        depth = _numeric(data.get("depth")) if isinstance(data, dict) else None
        if depth is None:
            continue
        visitor = event["visitor_id"]
        deepest[visitor] = max(depth, deepest.get(visitor, 0))

    return [
        {"x": 0, "y": milestone, "count": sum(1 for d in deepest.values() if d >= milestone)}
        for milestone in SCROLL_MILESTONES
    ]


@router.get("/{domainId}")
async def heatmap(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("heatmaps")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        page_url = request.query_params.get("page")
        event_type = request.query_params.get("type") or "click"
        viewport = request.query_params.get("viewport") or None
        if viewport is not None and viewport not in session_service.DEVICE_WIDTHS:
            raise SimpleError("viewport must be one of: desktop, tablet, mobile", 400)

        start_date, end_date = date_range(
            request.query_params.get("startDate"),
            request.query_params.get("endDate"),
            LOOKBACK_DAYS,
        )

        async def page_events(kind: str) -> list[dict]:
            events = await event_service.query_for_heatmap(
                domain["id"], start_date, end_date, kind, viewport
            )
            # Filter by page path when requested; fall back to the raw URL on parse failure
            if page_url:
                return [e for e in events if url_path(e["url"]) == page_url]
            return events

        filtered = await page_events(event_type)
        unplaced = 0
        if event_type == "scroll":
            points = _scroll_points(filtered)
            # Share of the page's visitors, not of those who scrolled at all.
            visitors = {e["visitor_id"] for e in await page_events("pageview")}
            visitors |= {e["visitor_id"] for e in filtered}
        else:
            points, unplaced = _click_points(filtered)
            visitors = {e["visitor_id"] for e in filtered}

        return jsjson(
            {
                "domainId": domain["id"],
                "pageUrl": page_url or "all",
                "type": event_type,
                "viewport": viewport or "all",
                "points": points,
                "totalInteractions": len(filtered),
                "unplacedInteractions": unplaced,
                "uniqueVisitors": len(visitors),
                "period": {"start": start_date, "end": end_date},
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Heatmap error: {exc}")
        raise SimpleError(FAILED_HEATMAP, 500) from None


@router.get("/{domainId}/pages")
async def heatmap_pages(
    domainId: str,
    startDate: str | None = Query(None),
    endDate: str | None = Query(None),
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("heatmaps")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = date_range(startDate, endDate, LOOKBACK_DAYS)

        events = await event_service.query_by_domain(
            domain["id"], start_date, end_date, "click"
        )

        page_map: dict[str, dict] = {}
        for event in events:
            # Skip URLs that are not absolute, mirroring the try/catch in Express
            path = _absolute_path(event["url"])
            if path is None:
                continue
            entry = page_map.setdefault(path, {"clicks": 0, "visitors": set()})
            entry["clicks"] += 1
            entry["visitors"].add(event["visitor_id"])

        pages = sorted(
            (
                {
                    "path": path,
                    "clicks": data["clicks"],
                    "visitors": len(data["visitors"]),
                }
                for path, data in page_map.items()
            ),
            key=lambda item: -item["clicks"],
        )[:PAGE_LIMIT]

        return jsjson({"pages": pages})
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Heatmap pages error: {exc}")
        raise SimpleError(FAILED_PAGES, 500) from None
