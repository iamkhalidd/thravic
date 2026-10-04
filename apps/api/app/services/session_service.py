"""Session data access — port of `services/sessionService.ts` (raw SQL preserved).

As with `event_service`, every `COUNT(*)::text` counter must be converted with
`int(...)` because the asyncpg `int8` codec returns a string to match
node-postgres's bigint handling.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from ..db import query, query_one
from ..js_compat import js_round
from . import visitor_service

DEFAULT_TOP_REFERRERS_LIMIT = 10
DEFAULT_REALTIME_WINDOW_MINUTES = 30

SEARCH_ENGINES = (
    "google.com",
    "bing.com",
    "yahoo.com",
    "duckduckgo.com",
    "baidu.com",
    "yandex.com",
    "ecosia.org",
    "brave.com",
    "search.yahoo.com",
)

SOCIAL_NETWORKS = (
    "facebook.com",
    "twitter.com",
    "x.com",
    "t.co",
    "linkedin.com",
    "instagram.com",
    "pinterest.com",
    "tiktok.com",
    "reddit.com",
    "youtube.com",
    "snapchat.com",
    "telegram.org",
    "whatsapp.com",
)

PAID_MEDIUMS = ("cpc", "ppc", "paid", "paidsearch", "paidsocial")


async def upsert(params: dict[str, Any]) -> dict[str, Any] | None:
    """Insert a session, or bump `pageviews` when the (session_id, domain_id) exists.

    `sessions.visitor_id` is a UUID foreign key into `visitors(id)`, while the
    client sends its own generated string. The visitor row is upserted first so
    the surrogate id can be stored — without it the insert fails the constraint.
    """
    visitor = await visitor_service.upsert(
        params.get("domainId"), params.get("visitorId")
    )
    visitor_pk = visitor["id"] if visitor else None

    rows = await query(
        """
        INSERT INTO sessions
            (session_id, domain_id, visitor_id, source, source_type, referrer,
             utm_source, utm_medium, utm_campaign, utm_term, utm_content,
             user_agent, screen_width, screen_height, language,
             country, region, city, pageviews)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18, 1)
        ON CONFLICT (session_id, domain_id)
        DO UPDATE SET
           pageviews = sessions.pageviews + 1,
           ended_at = NOW()
        RETURNING *
        """,
        params["sessionId"],
        params["domainId"],
        visitor_pk,
        params.get("source") or None,
        params.get("sourceType") or None,
        params.get("referrer") or None,
        params.get("utmSource") or None,
        params.get("utmMedium") or None,
        params.get("utmCampaign") or None,
        params.get("utmTerm") or None,
        params.get("utmContent") or None,
        params.get("userAgent") or None,
        # `|| null` in JS turns 0 into null too, which `or None` reproduces
        params.get("screenWidth") or None,
        params.get("screenHeight") or None,
        params.get("language") or None,
        params.get("country") or None,
        params.get("region") or None,
        params.get("city") or None,
    )
    return rows[0] if rows else None


async def query_by_domain(
    domain_id: str, start_date: datetime, end_date: datetime
) -> list[dict[str, Any]]:
    return await query(
        """
        SELECT * FROM sessions
        WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3
        ORDER BY started_at DESC
        """,
        domain_id,
        start_date,
        end_date,
    )


async def count_by_domain(
    domain_id: str, start_date: datetime, end_date: datetime
) -> int:
    row = await query_one(
        """
        SELECT COUNT(*)::text as count FROM sessions
        WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3
        """,
        domain_id,
        start_date,
        end_date,
    )
    return int((row or {}).get("count") or "0")


async def get_bounce_rate(
    domain_id: str, start_date: datetime, end_date: datetime
) -> float:
    """Percentage of sessions with a single pageview, to 2 decimal places."""
    row = await query_one(
        """
        SELECT
            COUNT(*)::text as total,
            COUNT(*) FILTER (WHERE pageviews <= 1)::text as bounced
        FROM sessions
        WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3
        """,
        domain_id,
        start_date,
        end_date,
    )
    total = int((row or {}).get("total") or "0")
    bounced = int((row or {}).get("bounced") or "0")
    if total <= 0:
        return 0
    return js_round((bounced / total) * 10000) / 100


async def get_avg_duration(
    domain_id: str, start_date: datetime, end_date: datetime
) -> int:
    """Average session duration in seconds, rounded."""
    row = await query_one(
        """
        SELECT COALESCE(
            AVG(EXTRACT(EPOCH FROM (COALESCE(ended_at, started_at) - started_at))),
            0
        )::text as avg_duration
        FROM sessions
        WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3
        """,
        domain_id,
        start_date,
        end_date,
    )
    return js_round(float((row or {}).get("avg_duration") or "0"))


async def get_source_type_breakdown(
    domain_id: str, start_date: datetime, end_date: datetime
) -> list[dict[str, Any]]:
    return await query(
        """
        SELECT COALESCE(source_type, 'direct') as source_type, COUNT(*)::int as count
        FROM sessions
        WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3
        GROUP BY source_type
        ORDER BY count DESC
        """,
        domain_id,
        start_date,
        end_date,
    )


async def get_top_referrers(
    domain_id: str,
    start_date: datetime,
    end_date: datetime,
    limit: int = DEFAULT_TOP_REFERRERS_LIMIT,
) -> list[dict[str, Any]]:
    return await query(
        """
        SELECT
            referrer,
            COUNT(*)::int as sessions,
            COUNT(DISTINCT visitor_id)::int as visitors
        FROM sessions
        WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3
          AND referrer IS NOT NULL AND referrer != ''
        GROUP BY referrer
        ORDER BY sessions DESC
        LIMIT $4
        """,
        domain_id,
        start_date,
        end_date,
        limit,
    )


async def get_realtime_active_sessions(
    domain_id: str, since_minutes: int = DEFAULT_REALTIME_WINDOW_MINUTES
) -> int:
    row = await query_one(
        """
        SELECT COUNT(*)::text as count FROM sessions
        WHERE domain_id = $1
          AND (ended_at IS NULL OR ended_at >= NOW() - ($2 || ' minutes')::interval)
          AND started_at >= NOW() - ($2 || ' minutes')::interval
        """,
        domain_id,
        str(since_minutes),
    )
    return int((row or {}).get("count") or "0")


def classify_source(
    referrer: str | None, utm_source: str | None, utm_medium: str | None
) -> str:
    """Classify traffic as direct | organic | paid | social | referral | email."""
    medium = (utm_medium or "").lower()
    source = (utm_source or "").lower()

    # UTM-based classification (most specific)
    if medium == "email" or source == "email":
        return "email"
    if medium in PAID_MEDIUMS:
        return "paid"
    if source or medium:
        return "paid"  # any other UTM = deliberate campaign

    if not referrer:
        return "direct"

    try:
        hostname = (urlparse(referrer).hostname or "").lower()
        hostname = hostname[4:] if hostname.startswith("www.") else hostname

        if any(
            hostname == engine or hostname.endswith("." + engine)
            for engine in SEARCH_ENGINES
        ):
            return "organic"

        if any(
            hostname == network or hostname.endswith("." + network)
            for network in SOCIAL_NETWORKS
        ):
            return "social"
    except Exception:
        pass  # malformed URL — treat as referral

    return "referral"
