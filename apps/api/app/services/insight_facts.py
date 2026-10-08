"""The facts AI insights are built from: this week against last, from the database.

Every number an insight can mention is computed here, never by the model. Each
fact gets an id (F1, F2, ...) that insights must cite; `insight_service` checks
that the numbers an insight uses appear in the facts it cites.

Five kinds, matching the five insight types:

* `overview` / `driver` — what changed in traffic, and which channel, referrer,
  campaign, device, country or landing page it came from;
* `page` — landing pages losing people (bounce rate well above the site's);
* `technical` — JavaScript errors, rage clicks and slow pages (LCP);
* `funnel` — each funnel's biggest drop-off, and how it moved;
* `opportunity` — channels and referrers whose visitors engage well above the
  site's average but bring a small share of sessions.

Only aggregates leave this module: counts, rates, page paths (no query string),
channel and referrer names. No visitor ids, IPs, recordings or typed values.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from ..db import query, query_one
from ..js_compat import js_round
from ..routers.funnels import _funnel_progress
from . import event_service, funnel_service, session_service
from .event_service import URL_PATH_SQL

WINDOW_DAYS = 7

# Below this many sessions in the current week there is too little to say.
MIN_SESSIONS = 50

# Smallest moves worth reporting, so noise on tiny numbers never becomes a story.
MIN_DRIVER_DELTA = 5
MIN_PAGE_ENTRIES = 20
BOUNCE_MARGIN_POINTS = 15
MIN_TECHNICAL_COUNT = 3
SLOW_LCP_MS = 2500
MIN_LCP_SAMPLES = 10
MIN_FUNNEL_ENTRANTS = 20
OPPORTUNITY_ENGAGEMENT_RATIO = 1.5
OPPORTUNITY_MAX_SHARE = 15
MIN_OPPORTUNITY_SESSIONS = 10
MAX_FUNNELS = 5

# The legacy source types, folded like the Sources page does.
_LEGACY = " ".join(
    f"WHEN '{old}' THEN '{new}'" for old, new in session_service.LEGACY_SOURCE_TYPES.items()
)

# Session dimensions a traffic change is broken down by: label, SQL, dashboard link.
DIMENSIONS: tuple[tuple[str, str, str], ...] = (
    (
        "channel",
        f"CASE COALESCE(source_type, 'direct') {_LEGACY} ELSE COALESCE(source_type, 'direct') END",
        "/dashboard/traffic/sources",
    ),
    ("referrer", session_service._REFERRER_HOST_SQL, "/dashboard/sources"),
    ("campaign", "NULLIF(utm_campaign, '')", "/dashboard/traffic/campaigns"),
    ("device", session_service.device_case_sql("screen_width"), "/dashboard/behavior/devices"),
    ("country", "NULLIF(country, '')", "/dashboard/traffic/sources"),
)


def pct_change(current: float, previous: float) -> int | None:
    """Whole-percent change; None when there was nothing before to compare with."""
    if not previous:
        return None
    return js_round((current - previous) / previous * 100)


def rate(part: float, whole: float) -> float:
    """Percentage to one decimal place."""
    return round(part / whole * 100, 1) if whole else 0.0


@dataclass
class Windows:
    start: datetime  # previous week starts
    mid: datetime  # current week starts
    end: datetime

    @classmethod
    def ending(cls, end: datetime) -> Windows:
        mid = end - timedelta(days=WINDOW_DAYS)
        return cls(start=mid - timedelta(days=WINDOW_DAYS), mid=mid, end=end)


@dataclass
class FactSheet:
    facts: list[dict[str, Any]] = field(default_factory=list)
    sessions: int = 0

    def add(self, kind: str, subject: str, numbers: dict[str, Any], link: str) -> None:
        self.facts.append(
            {
                "id": f"F{len(self.facts) + 1}",
                "kind": kind,
                "subject": subject,
                "numbers": {k: v for k, v in numbers.items() if v is not None},
                "link": link,
            }
        )


async def build(domain: dict[str, Any], end: datetime) -> FactSheet:
    """All facts for the week ending at `end`."""
    w = Windows.ending(end)
    sheet = FactSheet()
    await _overview(sheet, domain, w)
    if sheet.sessions < MIN_SESSIONS:
        return sheet
    await _drivers(sheet, domain, w)
    await _pages(sheet, domain, w)
    await _technical(sheet, domain, w)
    await _funnels(sheet, domain, w)
    await _opportunities(sheet, domain, w)
    return sheet


async def _overview(sheet: FactSheet, domain: dict, w: Windows) -> None:
    d = domain["id"]
    pv_now = await event_service.count_by_domain(d, w.mid, w.end, "pageview")
    pv_before = await event_service.count_by_domain(d, w.start, w.mid, "pageview")
    vis_now = await event_service.count_unique_visitors(d, w.mid, w.end)
    vis_before = await event_service.count_unique_visitors(d, w.start, w.mid)
    ses_now = await session_service.count_by_domain(d, w.mid, w.end)
    ses_before = await session_service.count_by_domain(d, w.start, w.mid)
    bounce_now = await session_service.get_bounce_rate(d, w.mid, w.end)
    bounce_before = await session_service.get_bounce_rate(d, w.start, w.mid)
    dur_now = await session_service.get_avg_duration(d, w.mid, w.end)
    dur_before = await session_service.get_avg_duration(d, w.start, w.mid)

    sheet.sessions = ses_now
    sheet.add(
        "overview",
        "Whole site, last 7 days vs the 7 days before",
        {
            "sessions": ses_now,
            "sessionsBefore": ses_before,
            "sessionsChangePct": pct_change(ses_now, ses_before),
            "visitors": vis_now,
            "visitorsBefore": vis_before,
            "visitorsChangePct": pct_change(vis_now, vis_before),
            "pageviews": pv_now,
            "pageviewsBefore": pv_before,
            "pageviewsChangePct": pct_change(pv_now, pv_before),
            "bounceRatePct": float(bounce_now),
            "bounceRateBeforePct": float(bounce_before),
            "avgSessionSeconds": dur_now,
            "avgSessionSecondsBefore": dur_before,
        },
        "/dashboard",
    )


async def _drivers(sheet: FactSheet, domain: dict, w: Windows) -> None:
    """The biggest movers in each dimension, plus landing pages."""
    for name, sql, link in DIMENSIONS:
        rows = await query(
            f"""
            SELECT {sql} AS key,
                   COUNT(*) FILTER (WHERE started_at >= $3)::int AS now,
                   COUNT(*) FILTER (WHERE started_at < $3)::int AS before
            FROM sessions
            WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $4
            GROUP BY 1
            """,
            domain["id"],
            w.start,
            w.mid,
            w.end,
        )
        _add_movers(sheet, name, rows, link)

    rows = await query(
        f"""
        WITH firsts AS (
            SELECT DISTINCT ON (session_id) session_id, created_at, {URL_PATH_SQL} AS path
            FROM events
            WHERE domain_id = $1 AND type = 'pageview' AND session_id IS NOT NULL
              AND created_at >= $2 AND created_at <= $4
            ORDER BY session_id, created_at
        )
        SELECT path AS key,
               COUNT(*) FILTER (WHERE created_at >= $3)::int AS now,
               COUNT(*) FILTER (WHERE created_at < $3)::int AS before
        FROM firsts GROUP BY 1
        """,
        domain["id"],
        w.start,
        w.mid,
        w.end,
    )
    _add_movers(sheet, "landing page", rows, "/dashboard/behavior/pages")


def _add_movers(sheet: FactSheet, dimension: str, rows: list[dict], link: str) -> None:
    movers = [r for r in rows if r["key"] and abs(r["now"] - r["before"]) >= MIN_DRIVER_DELTA]
    movers.sort(key=lambda r: abs(r["now"] - r["before"]), reverse=True)
    for row in movers[:2]:
        sheet.add(
            "driver",
            f"Sessions from {dimension} “{row['key']}”",
            {
                "sessions": row["now"],
                "sessionsBefore": row["before"],
                "sessionsDelta": row["now"] - row["before"],
                "sessionsChangePct": pct_change(row["now"], row["before"]),
            },
            link,
        )


async def _pages(sheet: FactSheet, domain: dict, w: Windows) -> None:
    now = await event_service.get_page_stats(domain["id"], w.mid, w.end, 100)
    before = {
        r["path"]: r for r in await event_service.get_page_stats(domain["id"], w.start, w.mid, 100)
    }
    entries = sum(r["entries"] for r in now)
    site_bounce = rate(sum(r["bounces"] for r in now), entries)

    candidates = []
    for row in now:
        if row["entries"] < MIN_PAGE_ENTRIES:
            continue
        bounce = rate(row["bounces"], row["entries"])
        if bounce >= site_bounce + BOUNCE_MARGIN_POINTS:
            candidates.append((row["entries"] * (bounce - site_bounce), row, bounce))
    candidates.sort(key=lambda c: c[0], reverse=True)

    for _, row, bounce in candidates[:3]:
        prev = before.get(row["path"])
        sheet.add(
            "page",
            f"Landing page {row['path']}",
            {
                "entries": row["entries"],
                "bounceRatePct": bounce,
                "siteBounceRatePct": site_bounce,
                "bounceRateBeforePct": rate(prev["bounces"], prev["entries"])
                if prev and prev["entries"]
                else None,
                "avgSecondsOnPage": row["avg_seconds"],
                "views": row["views"],
            },
            "/dashboard/behavior/pages",
        )


async def _counts_by_path(
    domain_id: str, event: str, w: Windows, label_sql: str
) -> list[dict[str, Any]]:
    return await query(
        f"""
        SELECT {URL_PATH_SQL} AS path, {label_sql} AS label,
               COUNT(*) FILTER (WHERE created_at >= $3)::int AS now,
               COUNT(*) FILTER (WHERE created_at < $3)::int AS before
        FROM events
        WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = $5
          AND created_at >= $2 AND created_at <= $4
        GROUP BY 1, 2
        ORDER BY now DESC
        LIMIT 3
        """,
        domain_id,
        w.start,
        w.mid,
        w.end,
        event,
    )


async def _technical(sheet: FactSheet, domain: dict, w: Windows) -> None:
    for row in await _counts_by_path(domain["id"], "error", w, "LEFT(data->>'message', 120)"):
        if row["now"] >= MIN_TECHNICAL_COUNT:
            sheet.add(
                "technical",
                f"JavaScript error on {row['path']}: {row['label'] or 'unknown error'}",
                {"errors": row["now"], "errorsBefore": row["before"]},
                "/dashboard/errors",
            )

    rage_label = "LEFT(COALESCE(NULLIF(data->>'text', ''), data->>'tag', 'element'), 60)"
    for row in await _counts_by_path(domain["id"], "rage_click", w, rage_label):
        if row["now"] >= MIN_TECHNICAL_COUNT:
            sheet.add(
                "technical",
                f"Rage clicks on “{row['label']}” at {row['path']}",
                {"rageClicks": row["now"], "rageClicksBefore": row["before"]},
                "/dashboard/rage-clicks",
            )

    slow = await query(
        f"""
        SELECT {URL_PATH_SQL} AS path,
               ROUND(AVG((data->>'lcp')::numeric) FILTER (WHERE created_at >= $3))::int AS lcp,
               ROUND(AVG((data->>'lcp')::numeric) FILTER (WHERE created_at < $3))::int AS lcp_prev,
               COUNT(*) FILTER (WHERE created_at >= $3)::int AS samples
        FROM events
        WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'performance'
          AND data->>'lcp' ~ '^[0-9.]+$'
          AND created_at >= $2 AND created_at <= $4
        GROUP BY 1
        HAVING COUNT(*) FILTER (WHERE created_at >= $3) >= $5
        ORDER BY lcp DESC
        LIMIT 2
        """,
        domain["id"],
        w.start,
        w.mid,
        w.end,
        MIN_LCP_SAMPLES,
    )
    for row in slow:
        if row["lcp"] and row["lcp"] > SLOW_LCP_MS:
            sheet.add(
                "technical",
                f"Slow page {row['path']} (largest contentful paint)",
                {
                    "lcpMs": row["lcp"],
                    "lcpBeforeMs": row["lcp_prev"],
                    "samples": row["samples"],
                    "goodLcpMs": SLOW_LCP_MS,
                },
                "/dashboard/performance",
            )


async def _funnels(sheet: FactSheet, domain: dict, w: Windows) -> None:
    funnels = (await funnel_service.list_by_domain(domain["id"]))[:MAX_FUNNELS]
    if not funnels:
        return
    # Only what step matching reads (see funnels._matches_step).
    events = await query(
        """
        SELECT visitor_id, type, url, data, created_at FROM events
        WHERE domain_id = $1 AND type IN ('pageview', 'custom')
          AND created_at >= $2 AND created_at <= $3
        """,
        domain["id"],
        w.start,
        w.end,
    )
    now_events = [e for e in events if e["created_at"] >= w.mid]
    before_events = [e for e in events if e["created_at"] < w.mid]

    for funnel in funnels:
        steps = funnel.get("steps") or []
        if len(steps) < 2:
            continue
        now = _funnel_progress(steps, now_events)
        before = _funnel_progress(steps, before_events)
        if now[0] < MIN_FUNNEL_ENTRANTS:
            continue
        drops = [
            (rate(now[i - 1] - now[i], now[i - 1]), i) for i in range(1, len(steps)) if now[i - 1]
        ]
        if not drops:
            continue
        drop, i = max(drops)
        sheet.add(
            "funnel",
            f"Funnel “{funnel['name']}”: step “{steps[i - 1]['name']}” → “{steps[i]['name']}”",
            {
                "entered": now[0],
                "completed": now[-1],
                "conversionPct": rate(now[-1], now[0]),
                "conversionBeforePct": rate(before[-1], before[0]) if before[0] else None,
                "dropOffPct": drop,
                "dropOffBeforePct": rate(before[i - 1] - before[i], before[i - 1])
                if before[i - 1]
                else None,
                "lostAtStep": now[i - 1] - now[i],
            },
            "/dashboard/funnels",
        )


async def _opportunities(sheet: FactSheet, domain: dict, w: Windows) -> None:
    totals = await query_one(
        """
        SELECT COUNT(*)::int AS sessions, COALESCE(SUM(pageviews), 0)::int AS pageviews
        FROM sessions WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3
        """,
        domain["id"],
        w.mid,
        w.end,
    )
    if not totals or not totals["sessions"]:
        return
    site_pps = totals["pageviews"] / totals["sessions"]

    found = []
    for name, sql, link in DIMENSIONS[:2]:  # channel, referrer
        rows = await query(
            f"""
            SELECT {sql} AS key, COUNT(*)::int AS sessions,
                   COALESCE(SUM(pageviews), 0)::int AS pageviews
            FROM sessions WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3
            GROUP BY 1
            """,
            domain["id"],
            w.mid,
            w.end,
        )
        for row in rows:
            if not row["key"] or row["sessions"] < MIN_OPPORTUNITY_SESSIONS:
                continue
            pps = row["pageviews"] / row["sessions"]
            share = rate(row["sessions"], totals["sessions"])
            if pps >= site_pps * OPPORTUNITY_ENGAGEMENT_RATIO and share < OPPORTUNITY_MAX_SHARE:
                found.append((pps / site_pps, name, row, pps, share, link))
    found.sort(key=lambda f: f[0], reverse=True)

    for _, name, row, pps, share, link in found[:2]:
        sheet.add(
            "opportunity",
            f"Visitors from {name} “{row['key']}”",
            {
                "pagesPerSession": round(pps, 1),
                "sitePagesPerSession": round(site_pps, 1),
                "sessions": row["sessions"],
                "shareOfSessionsPct": share,
            },
            link,
        )
