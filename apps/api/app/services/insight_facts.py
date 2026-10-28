"""The facts AI insights are built from: a period against the one just before it.

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
from .alert_service import ERROR_MESSAGE_SQL
from .event_service import URL_PATH_SQL

WINDOW_DAYS = 7  # the default period (and the daily email's)

# With no sessions at all in the period there is nothing to say.
MIN_SESSIONS = 1

# Smallest moves worth reporting, so noise on tiny numbers never becomes a story.
MIN_DRIVER_DELTA = 3
# A percentage needs this much to compare against; "up 1450%" from 4 sessions is noise.
MIN_PCT_BASE = 20
MIN_PAGE_ENTRIES = 10
BOUNCE_MARGIN_POINTS = 15
MIN_TECHNICAL_COUNT = 2
SLOW_LCP_MS = 2500
MIN_LCP_SAMPLES = 5
MIN_FUNNEL_ENTRANTS = 10
OPPORTUNITY_ENGAGEMENT_RATIO = 1.5
OPPORTUNITY_MAX_SHARE = 15
MIN_OPPORTUNITY_SESSIONS = 5
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
    """Whole-percent change; None when there was too little before to compare with."""
    if previous < MIN_PCT_BASE:
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
        return cls.covering(end - timedelta(days=WINDOW_DAYS), end)

    @classmethod
    def covering(cls, start: datetime, end: datetime) -> Windows:
        """`start`..`end`, compared with the period of the same length just before."""
        return cls(start=start - (end - start), mid=start, end=end)

    def describe(self) -> str:
        return f"{_day(self.mid)} to {_day(self.end)} vs {_day(self.start)} to {_day(self.mid)}"


def _day(value: datetime) -> str:
    return f"{value:%b} {value.day}"


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


async def build(domain: dict[str, Any], end: datetime, start: datetime | None = None) -> FactSheet:
    """All facts for `start`..`end` (default: the week ending at `end`)."""
    w = Windows.covering(start, end) if start else Windows.ending(end)
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
        f"Whole site, {w.describe()}",
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


# ── Explaining one change ──────────────────────────────────────────────────
#
# The AI analyst's facts: one metric in a period against the period before,
# broken down by page, channel, referrer, campaign, device, country and
# browser, and ranked by how much of the change each part accounts for. Then
# the errors, rage clicks and slow pages in the part that moved most, and the
# sessions to watch.

# What can be explained: label, the dashboard page that shows it, and for the
# event-based ones the custom event counted (`event` is the owner's own).
EXPLAIN_METRICS: dict[str, tuple[str, str]] = {
    "visitors": ("Visitors", "/dashboard/traffic/trends"),
    "sessions": ("Visits", "/dashboard/traffic/trends"),
    "pageviews": ("Page views", "/dashboard/behavior/pages"),
    "bounce_rate": ("Bounce rate", "/dashboard/behavior/pages"),
    "errors": ("JavaScript errors", "/dashboard/errors"),
    "rage_clicks": ("Rage clicks", "/dashboard/rage-clicks"),
    "event": ("Custom event", "/dashboard/funnels"),
}
_FIXED_EVENTS = {"errors": "error", "rage_clicks": "rage_click"}
_SESSION_METRICS = ("visitors", "sessions", "bounce_rate")

MAX_SEGMENTS = 8
MAX_PER_DIMENSION = 3
# A bounce-rate segment needs this many visits to say anything, and has to move
# the site's rate by this many points.
MIN_RATE_SESSIONS = 10
MIN_RATE_POINTS = 0.5
SLOW_GROWTH = 1.2  # a slow page counts as evidence when 20% slower than before
MAX_EVIDENCE_SESSIONS = 20

_SESSION_COLUMNS = (
    "s.id::text AS sid, s.source_type, s.referrer, s.utm_campaign, s.screen_width, "
    "s.country, s.user_agent"
)

# Each breakdown: name, SQL over the base columns, dashboard link. "page" is the
# landing page for visit-based metrics and the page the event happened on otherwise.
EXPLAIN_DIMENSIONS: tuple[tuple[str, str, str], ...] = (
    ("page", "page", "/dashboard/behavior/pages"),
    *DIMENSIONS,
    ("browser", session_service.browser_case_sql("user_agent"), "/dashboard/behavior/devices"),
)
_DIMENSION_SQL = {name: sql for name, sql, _ in EXPLAIN_DIMENSIONS}
_DIMENSION_LINK = {name: link for name, _, link in EXPLAIN_DIMENSIONS}


def dimension_label(dimension: str, metric: str) -> str:
    return "landing page" if dimension == "page" and metric in _SESSION_METRICS else dimension


def metric_label(metric: str, event: str | None = None) -> str:
    if metric == "event":
        return f"“{event}” events"
    return EXPLAIN_METRICS[metric][0]


def _base_sql(metric: str) -> str:
    """CTEs ending in `base`: one row per thing counted, with `cur` (in the period),
    `unit` (what is counted), `bounced`, `page` and the visit's own columns."""
    if metric in _SESSION_METRICS:
        unit = "s.visitor_id::text" if metric == "visitors" else "s.id::text"
        return f"""
        firsts AS (
            SELECT DISTINCT ON (session_id) session_id, {URL_PATH_SQL} AS path
            FROM events
            WHERE domain_id = $1 AND type = 'pageview' AND session_id IS NOT NULL
              AND created_at >= $2 AND created_at <= $4
            ORDER BY session_id, created_at
        ),
        base AS (
            SELECT s.started_at >= $3 AS cur, {unit} AS unit, s.pageviews <= 1 AS bounced,
                   f.path AS page, {_SESSION_COLUMNS}
            FROM sessions s LEFT JOIN firsts f ON f.session_id = s.id
            WHERE s.domain_id = $1 AND s.started_at >= $2 AND s.started_at <= $4
        )"""
    kind = "e.type = 'pageview'" if metric == "pageviews" else (
        "e.type = 'custom' AND e.data->>'event' = $5"
    )
    return f"""
        base AS (
            SELECT e.created_at >= $3 AS cur, e.id::text AS unit, FALSE AS bounced,
                   {URL_PATH_SQL} AS page, {_SESSION_COLUMNS}
            FROM events e LEFT JOIN sessions s ON s.id = e.session_id
            WHERE e.domain_id = $1 AND {kind} AND e.created_at >= $2 AND e.created_at <= $4
        )"""


_COUNTS = """
    COUNT(DISTINCT unit) FILTER (WHERE cur)::int AS now,
    COUNT(DISTINCT unit) FILTER (WHERE NOT cur)::int AS before,
    COUNT(DISTINCT unit) FILTER (WHERE cur AND bounced)::int AS now_bounced,
    COUNT(DISTINCT unit) FILTER (WHERE NOT cur AND bounced)::int AS before_bounced"""


async def breakdown_rows(
    domain_id: str, metric: str, w: Windows, event: str | None = None
) -> list[dict[str, Any]]:
    """The metric's totals (`dimension` "total") and its counts per segment, both periods."""
    branches = [f"SELECT 'total' AS dimension, 'all' AS key, {_COUNTS} FROM base"]
    branches += [
        f"SELECT '{name}', ({sql})::text, {_COUNTS} FROM base GROUP BY 2"
        for name, sql, _ in EXPLAIN_DIMENSIONS
    ]
    args: list[Any] = [domain_id, w.start, w.mid, w.end]
    if metric not in _SESSION_METRICS and metric != "pageviews":
        args.append(_FIXED_EVENTS.get(metric, event))
    return await query(f"WITH {_base_sql(metric)} " + " UNION ALL ".join(branches), *args)


def _segment_rate(bounced: int, total: int) -> float | None:
    return rate(bounced, total) if total else None


def rank_segments(
    rows: list[dict[str, Any]], is_rate: bool = False
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """The overall change and the segments behind it, biggest share first.

    For a count, a segment's part of the change is its own change. For the
    bounce rate it is how far the segment moved the site's rate, in points:
    its bounces above the earlier site rate now, minus the same before, over
    the site's visits. These add up exactly to the site's change, so a segment
    that grew but bounces as usual accounts for nothing.

    A segment that is the whole site is skipped. Only segments moving the same
    way as the whole are kept (`MAX_PER_DIMENSION`
    from any one breakdown); with no overall change, the biggest movers either way.
    """
    total = next((r for r in rows if r["dimension"] == "total"), None) or {
        "now": 0, "before": 0, "now_bounced": 0, "before_bounced": 0
    }
    n_now, n_before = total["now"], total["before"]
    if is_rate:
        rate_now = _segment_rate(total["now_bounced"], n_now) or 0.0
        rate_before = _segment_rate(total["before_bounced"], n_before) or 0.0
        overall = round(rate_now - rate_before, 1)
        headline = {
            "now": rate_now, "before": rate_before, "delta": overall, "changePct": None,
            "visits": n_now, "visitsBefore": n_before,
        }
    else:
        overall = n_now - n_before
        headline = {
            "now": n_now, "before": n_before, "delta": overall,
            "changePct": pct_change(n_now, n_before),
        }

    candidates = []
    for row in rows:
        if row["dimension"] == "total" or not row["key"]:
            continue
        if row["now"] == n_now and row["before"] == n_before:
            continue  # the whole site (every sign-up is on /signup): explains nothing
        if is_rate:
            if max(row["now"], row["before"]) < MIN_RATE_SESSIONS:
                continue
            base = rate_before / 100
            now_part = (row["now_bounced"] - base * row["now"]) / n_now if n_now else 0.0
            before_part = (
                (row["before_bounced"] - base * row["before"]) / n_before if n_before else 0.0
            )
            effect = round((now_part - before_part) * 100, 1)
            if abs(effect) < MIN_RATE_POINTS:
                continue
            seg_now = _segment_rate(row["now_bounced"], row["now"])
            seg_before = _segment_rate(row["before_bounced"], row["before"])
            segment = {
                "now": seg_now, "before": seg_before,
                "delta": round(seg_now - seg_before, 1)
                if seg_now is not None and seg_before is not None else None,
                "changePct": None, "visits": row["now"], "visitsBefore": row["before"],
            }
        else:
            effect = row["now"] - row["before"]
            if abs(effect) < MIN_DRIVER_DELTA:
                continue
            segment = {
                "now": row["now"], "before": row["before"], "delta": effect,
                "changePct": pct_change(row["now"], row["before"]),
            }
        candidates.append({"dimension": row["dimension"], "key": row["key"], **segment,
                           "effect": effect})

    direction = 1 if overall > 0 else -1 if overall < 0 else 0
    if direction:
        candidates = [c for c in candidates if c["effect"] * direction > 0]
        candidates.sort(key=lambda c: c["effect"] * direction, reverse=True)
    else:
        candidates.sort(key=lambda c: abs(c["effect"]), reverse=True)

    ranked: list[dict[str, Any]] = []
    per_dimension: dict[str, int] = {}
    for c in candidates:
        if per_dimension.get(c["dimension"], 0) >= MAX_PER_DIMENSION:
            continue
        per_dimension[c["dimension"]] = per_dimension.get(c["dimension"], 0) + 1
        c["shareOfChangePct"] = js_round(c["effect"] / overall * 100) if overall else None
        c["link"] = _DIMENSION_LINK.get(c["dimension"], "/dashboard")
        ranked.append(c)
        if len(ranked) >= MAX_SEGMENTS:
            break
    return headline, ranked


def _segment_filter(segment: dict[str, Any] | None, param: int) -> str:
    if not segment:
        return "TRUE"
    return f"({_DIMENSION_SQL[segment['dimension']]})::text = ${param}"


async def evidence_rows(
    domain_id: str, w: Windows, segment: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Errors, rage clicks and page speed per page in both periods, in the segment
    (or the whole site): visits affected, median LCP, and the visits to watch."""
    rows = await query(
        f"""
        WITH ev AS (
            SELECT e.created_at >= $3 AS cur, e.session_id, e.data->>'event' AS event,
                   {URL_PATH_SQL} AS page,
                   CASE e.data->>'event'
                       WHEN 'error' THEN LEFT({ERROR_MESSAGE_SQL}, 120)
                       WHEN 'rage_click' THEN LEFT(COALESCE(NULLIF(e.data->>'text', ''),
                                                            e.data->>'tag', 'element'), 60)
                   END AS label,
                   CASE WHEN e.data->>'lcp' ~ '^[0-9]+(\\.[0-9]+)?$'
                        THEN (e.data->>'lcp')::float8 END AS lcp,
                   {_SESSION_COLUMNS}
            FROM events e LEFT JOIN sessions s ON s.id = e.session_id
            WHERE e.domain_id = $1 AND e.type = 'custom'
              AND e.data->>'event' IN ('error', 'rage_click', 'performance')
              AND e.created_at >= $2 AND e.created_at <= $4
        )
        SELECT event, page, label,
               COUNT(DISTINCT session_id) FILTER (WHERE cur)::int AS now,
               COUNT(DISTINCT session_id) FILTER (WHERE NOT cur)::int AS before,
               ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY lcp)
                      FILTER (WHERE cur))::numeric)::int AS lcp_now,
               ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY lcp)
                      FILTER (WHERE NOT cur))::numeric)::int AS lcp_before,
               COUNT(lcp) FILTER (WHERE cur)::int AS samples,
               (array_agg(DISTINCT session_id::text) FILTER (WHERE cur))[1:{MAX_EVIDENCE_SESSIONS}]
                   AS session_ids
        FROM ev
        WHERE {_segment_filter(segment, 5)}
        GROUP BY 1, 2, 3
        """,
        domain_id,
        w.start,
        w.mid,
        w.end,
        *([segment["key"]] if segment else []),
    )
    return rows


def pick_evidence(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """What in the rows could explain a change: errors and rage clicks that hit at
    least `MIN_TECHNICAL_COUNT` visits and more than before, and pages slower than
    `SLOW_LCP_MS` and than before. Most new visits affected first; slow pages last."""
    errors, rage, slow = [], [], []
    for r in rows:
        if r["event"] in ("error", "rage_click"):
            if r["now"] >= MIN_TECHNICAL_COUNT and r["now"] > r["before"]:
                (errors if r["event"] == "error" else rage).append(r)
        elif (
            r["event"] == "performance"
            and r["samples"] >= MIN_LCP_SAMPLES
            and (r["lcp_now"] or 0) > SLOW_LCP_MS
            and (not r["lcp_before"] or r["lcp_now"] >= r["lcp_before"] * SLOW_GROWTH)
        ):
            slow.append(r)
    errors.sort(key=lambda r: r["now"] - r["before"], reverse=True)
    rage.sort(key=lambda r: r["now"] - r["before"], reverse=True)
    slow.sort(key=lambda r: r["lcp_now"], reverse=True)

    out = []
    for r in errors[:3]:
        out.append({
            "kind": "error",
            "subject": f"JavaScript error on {r['page']}: {r['label'] or 'unknown error'}",
            "numbers": {"visitsAffected": r["now"], "visitsAffectedBefore": r["before"]},
            "link": "/dashboard/errors",
            "sessions": list(r["session_ids"] or []),
        })
    for r in rage[:2]:
        out.append({
            "kind": "rage_click",
            "subject": f"Rage clicks on “{r['label']}” at {r['page']}",
            "numbers": {"visitsAffected": r["now"], "visitsAffectedBefore": r["before"]},
            "link": "/dashboard/rage-clicks",
            "sessions": list(r["session_ids"] or []),
        })
    for r in slow[:2]:
        out.append({
            "kind": "slow_page",
            "subject": f"Slow page {r['page']} (largest contentful paint)",
            "numbers": {
                "lcpMs": r["lcp_now"], "lcpBeforeMs": r["lcp_before"],
                "samples": r["samples"], "goodLcpMs": SLOW_LCP_MS,
            },
            "link": "/dashboard/performance",
            "sessions": list(r["session_ids"] or []),
        })
    return out


async def segment_sessions(
    domain_id: str, w: Windows, segment: dict[str, Any] | None
) -> list[str]:
    """Recent visits in the segment during the period, for recordings to watch."""
    rows = await query(
        f"WITH {_base_sql('pageviews')} "
        f"SELECT sid FROM base WHERE cur AND sid IS NOT NULL AND {_segment_filter(segment, 5)} "
        f"GROUP BY sid LIMIT {MAX_EVIDENCE_SESSIONS * 10}",
        domain_id,
        w.start,
        w.mid,
        w.end,
        *([segment["key"]] if segment else []),
    )
    return [r["sid"] for r in rows]


@dataclass
class Explanation:
    metric: str
    event: str | None
    headline: dict[str, Any]
    segments: list[dict[str, Any]]
    evidence: list[dict[str, Any]]
    # Evidence and segment sessions in order of interest; recordings are picked from these.
    sessions: list[str]
    sheet: FactSheet
    windows: Windows


async def explain(
    domain: dict[str, Any], metric: str, w: Windows, event: str | None = None
) -> Explanation:
    """Every number the analyst may use about one metric's change, as facts."""
    domain_id = str(domain["id"])
    is_rate = metric == "bounce_rate"
    sheet = FactSheet()
    await _overview(sheet, domain, w)

    headline, segments = rank_segments(
        await breakdown_rows(domain_id, metric, w, event), is_rate
    )
    label = metric_label(metric, event)
    link = EXPLAIN_METRICS[metric][1]
    if is_rate:
        sheet.add(
            "change",
            f"{label}, {w.describe()}",
            {
                "bounceRatePct": headline["now"],
                "bounceRateBeforePct": headline["before"],
                "changePoints": headline["delta"],
                "visits": headline["visits"],
                "visitsBefore": headline["visitsBefore"],
            },
            link,
        )
    else:
        sheet.add(
            "change",
            f"{label}, {w.describe()}",
            {
                "count": headline["now"],
                "countBefore": headline["before"],
                "delta": headline["delta"],
                "changePct": headline["changePct"],
            },
            link,
        )

    for seg in segments:
        subject = f"{label} from {dimension_label(seg['dimension'], metric)} “{seg['key']}”"
        if is_rate:
            numbers = {
                "bounceRatePct": seg["now"],
                "bounceRateBeforePct": seg["before"],
                "visits": seg["visits"],
                "visitsBefore": seg["visitsBefore"],
                "movedSiteRatePoints": seg["effect"],
                "shareOfChangePct": seg["shareOfChangePct"],
            }
        else:
            numbers = {
                "count": seg["now"],
                "countBefore": seg["before"],
                "delta": seg["delta"],
                "changePct": seg["changePct"],
                "shareOfChangePct": seg["shareOfChangePct"],
            }
        sheet.add("segment", subject, numbers, seg["link"])
        seg["fact"] = sheet.facts[-1]["id"]

    top = segments[0] if segments else None
    evidence = pick_evidence(await evidence_rows(domain_id, w, top))
    scope = f"{dimension_label(top['dimension'], metric)} “{top['key']}”" if top else None
    if not evidence and top:
        evidence, scope = pick_evidence(await evidence_rows(domain_id, w, None)), None
    for item in evidence:
        item["scope"] = scope or "whole site"
        sheet.add("evidence", f"{item['subject']} ({item['scope']})", item["numbers"],
                  item["link"])
        item["fact"] = sheet.facts[-1]["id"]

    sessions = [s for item in evidence for s in item["sessions"]]
    sessions += await segment_sessions(domain_id, w, top)
    return Explanation(
        metric, event, headline, segments, evidence, list(dict.fromkeys(sessions)), sheet, w
    )