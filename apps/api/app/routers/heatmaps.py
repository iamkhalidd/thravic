"""Heatmap routes — port of `routes/heatmaps.ts`.

Both handlers are gated by `requireFeature('heatmaps')`, which runs *before* the
domain lookup, so a free-plan caller gets 403 rather than 404.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Request

from ..errors import SimpleError
from ..js_compat import js_round, url_path
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
from ..services import domain_service, event_service

log = create_logger("Heatmaps")

router = APIRouter()

LOOKBACK_DAYS = 30
PAGE_LIMIT = 20

FAILED_HEATMAP = "Failed to get heatmap data"
FAILED_PAGES = "Failed to get heatmap pages"


async def _require_owned_domain(domain_id: str, user_id: str) -> dict:
    domain = await domain_service.get_by_id(domain_id)
    if not domain_service.is_owner(domain, user_id):
        raise SimpleError("Domain not found", 404)
    return domain


def _lookback_range() -> tuple[datetime, datetime]:
    """Heatmaps always use a fixed 30-day lookback; the query string is ignored."""
    end_date = datetime.now(UTC)
    return end_date - timedelta(days=LOOKBACK_DAYS), end_date


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

        start_date, end_date = _lookback_range()

        events = await event_service.query_by_domain(
            domain["id"], start_date, end_date, event_type
        )

        # Filter by page path when requested; fall back to the raw URL on parse failure
        if page_url:
            filtered = [e for e in events if url_path(e["url"]) == page_url]
        else:
            filtered = events

        point_map: dict[str, dict] = {}
        for event in filtered:
            data = event.get("data") or {}
            if not isinstance(data, dict):
                continue
            x, y = _numeric(data.get("x")), _numeric(data.get("y"))
            if x is None or y is None:
                continue
            key = f"{js_round(x)},{js_round(y)}"
            entry = point_map.setdefault(key, {"x": js_round(x), "y": js_round(y), "count": 0})
            entry["count"] += 1

        points = sorted(point_map.values(), key=lambda item: -item["count"])

        return jsjson(
            {
                "domainId": domain["id"],
                "pageUrl": page_url or "all",
                "type": event_type,
                "points": points,
                "totalInteractions": len(filtered),
                "uniqueVisitors": len({e["visitor_id"] for e in filtered}),
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
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("heatmaps")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _lookback_range()

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
