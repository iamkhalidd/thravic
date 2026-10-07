"""Traffic source routes — port of `routes/sources.ts`.

Note `identify_platform` uses a **substring** match (`host.includes(pattern)`), not
a suffix or equality check; the quirk is reproduced because it changes
classification. Referrers are grouped by hostname in `session_service`.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Request

from ..errors import SimpleError
from ..js_compat import js_round
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..services import domain_service, event_service, session_service

log = create_logger("Sources")

router = APIRouter()

DEFAULT_RANGE_DAYS = 30
REFERRER_LIMIT = 20
OVERVIEW_REFERRER_LIMIT = 5
CAMPAIGN_LIMIT = 20
TOP_SOCIAL_LIMIT = 5
TOP_CAMPAIGN_LIMIT = 5

SOCIAL_PLATFORMS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Facebook", ("facebook.com", "fb.com", "fb.me")),
    ("Twitter/X", ("twitter.com", "x.com", "t.co")),
    ("LinkedIn", ("linkedin.com", "lnkd.in")),
    ("Instagram", ("instagram.com",)),
    ("YouTube", ("youtube.com", "youtu.be")),
    ("TikTok", ("tiktok.com",)),
    ("Reddit", ("reddit.com",)),
    ("Pinterest", ("pinterest.com",)),
)

SEARCH_ENGINES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Google", ("google.com", "google.co")),
    ("Bing", ("bing.com",)),
    ("Yahoo", ("yahoo.com", "search.yahoo")),
    ("DuckDuckGo", ("duckduckgo.com",)),
    ("Baidu", ("baidu.com",)),
)

SOURCE_TYPES = ("direct", "organic", "social", "referral", "paid", "email")

# Route-specific 500 bodies
FAILED_REFERRERS = "Failed to get referrer data"
FAILED_SOCIAL = "Failed to get social data"
FAILED_SEARCH = "Failed to get search data"
FAILED_CAMPAIGNS = "Failed to get campaign data"
FAILED_OVERVIEW = "Failed to get sources overview"


def _parse_date(value: str) -> datetime:
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
        _parse_date(start) if start else end_date - timedelta(days=DEFAULT_RANGE_DAYS)
    )
    return start_date, end_date


async def _require_owned_domain(domain_id: str, user_id: str) -> dict:
    domain = await domain_service.get_by_id(domain_id)
    if not domain_service.is_owner(domain, user_id):
        raise SimpleError("Domain not found", 404)
    return domain


def identify_platform(
    referrer: str | None, platforms: tuple[tuple[str, tuple[str, ...]], ...]
) -> str | None:
    """Substring match against each platform's patterns, in declaration order."""
    if not referrer:
        return None
    try:
        parsed = urlparse(referrer)
        if not parsed.hostname:
            raise ValueError("no hostname")
        host = parsed.hostname.replace("www.", "")
    except Exception:
        return None

    for name, patterns in platforms:
        if any(pattern in host for pattern in patterns):
            return name
    return None


@router.get("/{domainId}/referrers")
async def referrers(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        top = await session_service.get_top_referrers(
            domain["id"], start_date, end_date, REFERRER_LIMIT, domain.get("domain")
        )

        return jsjson(
            {
                "period": {"start": start_date, "end": end_date},
                "referrers": [
                    {
                        "site": row["site"],
                        "sessions": row["sessions"],
                        "visitors": row["visitors"],
                        "pageviews": row["pageviews"],
                        "pagesPerSession": (
                            round(row["pageviews"] / row["sessions"], 1) if row["sessions"] else 0
                        ),
                    }
                    for row in top
                ],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Referrers error: {exc}")
        raise SimpleError(FAILED_REFERRERS, 500) from None


def _engagement(bounces: int, sessions: int) -> dict[str, int | str]:
    """Bounce rate (sessions with at most one pageview) and a High/Medium/Low label."""
    bounce_rate = js_round(bounces / sessions * 100) if sessions else 0
    label = "High" if bounce_rate < 40 else "Medium" if bounce_rate < 70 else "Low"
    return {"bounceRate": bounce_rate, "engagement": label}


@router.get("/{domainId}/social")
async def social(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        sessions = await session_service.query_by_domain(
            domain["id"], start_date, end_date
        )

        # visitor_id sets may contain None, and the size counts it — as in JS
        platform_map: dict[str, dict] = {}
        for session in sessions:
            platform = identify_platform(session["referrer"], SOCIAL_PLATFORMS)
            if not platform:
                continue
            entry = platform_map.setdefault(
                platform, {"visitors": set(), "sessions": 0, "bounces": 0}
            )
            entry["visitors"].add(session["visitor_id"])
            entry["sessions"] += 1
            if (session.get("pageviews") or 0) <= 1:
                entry["bounces"] += 1

        platforms = sorted(
            (
                {
                    "platform": platform,
                    "visitors": len(data["visitors"]),
                    "sessions": data["sessions"],
                    **_engagement(data["bounces"], data["sessions"]),
                }
                for platform, data in platform_map.items()
            ),
            key=lambda item: -item["visitors"],
        )

        return jsjson(
            {
                "period": {"start": start_date, "end": end_date},
                "totalSocialVisitors": sum(p["visitors"] for p in platforms),
                "platforms": platforms,
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Social sources error: {exc}")
        raise SimpleError(FAILED_SOCIAL, 500) from None


@router.get("/{domainId}/search")
async def search(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        sessions = await session_service.query_by_domain(
            domain["id"], start_date, end_date
        )

        engine_map: dict[str, dict] = {}
        for session in sessions:
            engine = identify_platform(session["referrer"], SEARCH_ENGINES)
            if not engine:
                continue
            entry = engine_map.setdefault(engine, {"visitors": set(), "sessions": 0})
            entry["visitors"].add(session["visitor_id"])
            entry["sessions"] += 1

        engines = sorted(
            (
                {
                    "engine": engine,
                    "visitors": len(data["visitors"]),
                    "sessions": data["sessions"],
                }
                for engine, data in engine_map.items()
            ),
            key=lambda item: -item["visitors"],
        )

        total_organic = sum(e["sessions"] for e in engines)

        return jsjson(
            {
                "period": {"start": start_date, "end": end_date},
                "totalOrganicSessions": total_organic,
                "engines": [
                    {
                        "engine": e["engine"],
                        "visitors": e["visitors"],
                        "sessions": e["sessions"],
                        "share": js_round((e["sessions"] / total_organic) * 100)
                        if total_organic > 0
                        else 0,
                    }
                    for e in engines
                ],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Search sources error: {exc}")
        raise SimpleError(FAILED_SEARCH, 500) from None


@router.get("/{domainId}/campaigns")
async def campaigns(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        events = await event_service.query_by_domain(domain["id"], start_date, end_date)

        campaign_map: dict[str, dict] = {}
        for event in events:
            if not event["utm_campaign"]:
                continue
            entry = campaign_map.setdefault(
                event["utm_campaign"],
                {
                    "source": event["utm_source"],
                    "medium": event["utm_medium"],
                    "visitors": set(),
                    "sessions": set(),
                    "pageviews": 0,
                },
            )
            entry["visitors"].add(event["visitor_id"])
            entry["sessions"].add(event["session_id"])
            if event["type"] == "pageview":
                entry["pageviews"] += 1

        campaign_list = sorted(
            (
                {
                    "campaign": campaign,
                    "source": data["source"],
                    "medium": data["medium"],
                    "visitors": len(data["visitors"]),
                    "sessions": len(data["sessions"]),
                    "pageviews": data["pageviews"],
                    "pagesPerSession": (
                        round(data["pageviews"] / len(data["sessions"]), 1)
                        if data["sessions"]
                        else 0
                    ),
                }
                for campaign, data in campaign_map.items()
            ),
            key=lambda item: -item["visitors"],
        )[:CAMPAIGN_LIMIT]

        return jsjson(
            {
                "period": {"start": start_date, "end": end_date},
                "totalCampaignVisitors": len(
                    {e["visitor_id"] for e in events if e["utm_campaign"]}
                ),
                "campaigns": campaign_list,
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Campaigns error: {exc}")
        raise SimpleError(FAILED_CAMPAIGNS, 500) from None


@router.get("/{domainId}/overview")
async def overview(domainId: str, request: Request, user: AuthUser = Depends(require_auth)):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        start_date, end_date = _get_date_range(
            request.query_params.get("start"), request.query_params.get("end")
        )

        source_types = await session_service.get_source_type_breakdown(
            domain["id"], start_date, end_date
        )
        top_referrers = await session_service.get_top_referrers(
            domain["id"], start_date, end_date, OVERVIEW_REFERRER_LIMIT, domain.get("domain")
        )
        sessions = await session_service.query_by_domain(
            domain["id"], start_date, end_date
        )
        events = await event_service.query_by_domain(domain["id"], start_date, end_date)

        breakdown: dict[str, int] = {name: 0 for name in SOURCE_TYPES}
        for row in source_types:
            breakdown[row["source_type"]] = row["count"]
        total = sum(breakdown.values())

        def build_type(key: str) -> dict:
            count = breakdown.get(key, 0)
            return {
                "count": count,
                "percentage": js_round((count / total) * 100) if total > 0 else 0,
            }

        platform_map: dict[str, int] = {}
        for session in sessions:
            platform = identify_platform(session["referrer"], SOCIAL_PLATFORMS)
            if platform:
                platform_map[platform] = platform_map.get(platform, 0) + 1

        top_social = sorted(
            ({"platform": p, "sessions": c} for p, c in platform_map.items()),
            key=lambda item: -item["sessions"],
        )[:TOP_SOCIAL_LIMIT]

        campaign_map: dict[str, int] = {}
        for event in events:
            if event["utm_campaign"]:
                campaign_map[event["utm_campaign"]] = (
                    campaign_map.get(event["utm_campaign"], 0) + 1
                )

        top_campaigns = sorted(
            ({"campaign": c, "events": n} for c, n in campaign_map.items()),
            key=lambda item: -item["events"],
        )[:TOP_CAMPAIGN_LIMIT]

        return jsjson(
            {
                "summary": {
                    "totalSessions": total,
                    "byType": {
                        "direct": build_type("direct"),
                        "organic": build_type("organic"),
                        "social": build_type("social"),
                        "referral": build_type("referral"),
                        "paid": build_type("paid"),
                        "email": build_type("email"),
                    },
                },
                "topReferrers": [
                    {"site": row["site"], "sessions": row["sessions"]}
                    for row in top_referrers
                ],
                "topSocial": top_social,
                "topCampaigns": top_campaigns,
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Sources overview error: {exc}")
        raise SimpleError(FAILED_OVERVIEW, 500) from None
