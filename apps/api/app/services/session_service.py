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

# Device classes by `sessions.screen_width`: [lower, upper) in CSS pixels. The
# analytics devices breakdown, the heatmap filter and the recordings filter all
# bucket with these, so the same session lands in the same class everywhere.
DEVICE_WIDTHS: dict[str, tuple[int, int | None]] = {
    "mobile": (0, 768),
    "tablet": (768, 1024),
    "desktop": (1024, None),
}


def device_case_sql(width_column: str) -> str:
    """SQL `CASE` naming the device class of `width_column` (`unknown` when NULL)."""
    branches = " ".join(
        f"WHEN {width_column} < {upper} THEN '{device}'"
        for device, (_, upper) in DEVICE_WIDTHS.items()
        if upper is not None
    )
    return f"CASE WHEN {width_column} IS NULL THEN 'unknown' {branches} ELSE 'desktop' END"


def device_width_sql(width_column: str, device: str, first_param: int) -> tuple[str, list[int]]:
    """A `WHERE` fragment restricting `width_column` to `device`'s range.

    Returns the SQL and its parameters, numbered from `$first_param`.
    """
    lower, upper = DEVICE_WIDTHS[device]
    if upper is None:
        return f"{width_column} >= ${first_param}", [lower]
    return (
        f"{width_column} >= ${first_param} AND {width_column} < ${first_param + 1}",
        [lower, upper],
    )


async def upsert(params: dict[str, Any]) -> dict[str, Any] | None:
    """Insert a session, or refresh `ended_at` when (session_id, domain_id) exists.

    `sessions.visitor_id` is a UUID foreign key into `visitors(id)`, while the
    client sends its own generated string. The visitor row is upserted first so
    the surrogate id can be stored — without it the insert fails the constraint.

    `pageviews` starts at 0 and is deliberately NOT incremented here. It is a
    derived value owned by `event_service`, which recomputes it from the
    deduplicated `events` rows after every insert. Bumping it per request could
    never be idempotent: the collector upserts once per event in a batch, and the
    tracker re-sends unacknowledged batches, so a counter grew with retries while
    the real number of pageviews stayed flat.
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
             country, region, city, os, os_version, app_version, device_model,
             pageviews)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18, $19, $20, $21, $22, 0)
        ON CONFLICT (session_id, domain_id)
        DO UPDATE SET
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
        # Reported by the mobile app SDK; NULL for websites.
        params.get("os") or None,
        params.get("osVersion") or None,
        params.get("appVersion") or None,
        params.get("deviceModel") or None,
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
    """Sessions per channel, with legacy source types folded into today's six."""
    legacy = " ".join(
        f"WHEN '{old}' THEN '{new}'" for old, new in LEGACY_SOURCE_TYPES.items()
    )
    return await query(
        f"""
        SELECT CASE COALESCE(source_type, 'direct') {legacy}
                   ELSE COALESCE(source_type, 'direct') END AS source_type,
               COUNT(*)::int as count
        FROM sessions
        WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3
        GROUP BY 1
        ORDER BY count DESC
        """,
        domain_id,
        start_date,
        end_date,
    )


# The referrer's hostname, lower-cased and without `www.`, in SQL.
_REFERRER_HOST_SQL = (
    "LOWER(REGEXP_REPLACE("
    "SUBSTRING(referrer FROM '^[A-Za-z][A-Za-z0-9+.-]*://([^/:?#]+)'), '^www\\.', ''))"
)


async def get_top_referrers(
    domain_id: str,
    start_date: datetime,
    end_date: datetime,
    limit: int = DEFAULT_TOP_REFERRERS_LIMIT,
    own_host: str | None = None,
    referrals_only: bool = False,
) -> list[dict[str, Any]]:
    """Top referring sites: one row per hostname (not per full URL, which split one
    site across many rows), excluding the tracked site itself.

    With `referrals_only`, only sessions of the referral channel count, so search
    engines and social networks (their own channels) are left out.
    """
    own = (own_host or "").lower().removeprefix("www.")
    channel = "AND source_type = 'referral'" if referrals_only else ""
    return await query(
        f"""
        SELECT {_REFERRER_HOST_SQL} AS site,
               COUNT(*)::int AS sessions,
               COUNT(DISTINCT visitor_id)::int AS visitors,
               COALESCE(SUM(pageviews), 0)::int AS pageviews
        FROM sessions
        WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3
          AND referrer IS NOT NULL AND referrer != ''
          AND {_REFERRER_HOST_SQL} IS NOT NULL
          AND NOT ({_REFERRER_HOST_SQL} = $5 OR {_REFERRER_HOST_SQL} LIKE '%.' || $5)
          {channel}
        GROUP BY 1
        ORDER BY sessions DESC
        LIMIT $4
        """,
        domain_id,
        start_date,
        end_date,
        limit,
        own,
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


# utm_medium values that name a channel rather than a paid campaign.
SOCIAL_MEDIUMS = ("social", "social-media", "social_media", "sm", "socialnetwork", "social-network")
EMAIL_MEDIUMS = ("email", "e-mail", "newsletter", "mail")
ORGANIC_MEDIUMS = ("organic", "seo")
REFERRAL_MEDIUMS = ("referral", "referrer", "link")

# Legacy `sessions.source_type` values written by the old classifier, folded into
# the six channels the dashboard shows so older sessions are not left out.
LEGACY_SOURCE_TYPES = {"search": "organic", "ad": "paid", "campaign": "paid", "internal": "direct"}


def _host(url: str | None) -> str:
    """Lower-cased hostname without a leading `www.`; empty when unparseable."""
    try:
        hostname = (urlparse(url or "").hostname or "").lower()
    except Exception:
        return ""
    return hostname[4:] if hostname.startswith("www.") else hostname


def _matches(hostname: str, domains: tuple[str, ...]) -> bool:
    return any(hostname == d or hostname.endswith("." + d) for d in domains)


def classify_source(
    referrer: str | None,
    utm_source: str | None,
    utm_medium: str | None,
    own_host: str | None = None,
) -> str:
    """Classify traffic as direct | organic | paid | social | referral | email.

    `own_host` is the tracked site's domain: a referrer from the site itself (a new
    session started from one of its own pages) is not a referral, it is direct.
    """
    medium = (utm_medium or "").lower().strip()
    source = (utm_source or "").lower().strip()

    # UTM-based classification (most specific)
    if medium in EMAIL_MEDIUMS or source in EMAIL_MEDIUMS:
        return "email"
    if medium in PAID_MEDIUMS:
        return "paid"
    if medium in SOCIAL_MEDIUMS:
        return "social"
    if medium in ORGANIC_MEDIUMS:
        return "organic"
    if medium in REFERRAL_MEDIUMS:
        return "referral"
    if source and not medium:
        # utm_source alone: name the channel when the source is a known network
        source_host = source if "." in source else f"{source}.com"
        if _matches(source_host, SOCIAL_NETWORKS):
            return "social"
        if _matches(source_host, SEARCH_ENGINES):
            return "organic"
    if source or medium:
        return "paid"  # any other UTM = deliberate campaign

    hostname = _host(referrer)
    if not hostname:
        return "direct"

    own = (own_host or "").lower().removeprefix("www.")
    if own and (hostname == own or hostname.endswith("." + own)):
        return "direct"
    if _matches(hostname, SEARCH_ENGINES):
        return "organic"
    if _matches(hostname, SOCIAL_NETWORKS):
        return "social"
    return "referral"
