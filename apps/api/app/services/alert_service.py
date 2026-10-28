"""Smart alerts: what changed on a site that its owner should know about now.

The hourly job (`jobs/smart_alerts`) calls `check_domain` for each site. Each
check compares the recent past with what is normal for that site, so a quiet
Sunday night or the usual morning rise raises nothing:

* traffic: sessions in the last `WINDOW` against the median of the same hours
  on the same weekday over the previous `BASELINE_WEEKS` weeks (`traffic_drop`,
  `traffic_spike`, and `silent` when nothing arrived at all);
* errors: a JavaScript error first seen in the last `WINDOW` that several
  visitors hit (`new_error`);
* rage clicks: a page where far more visitors rage-clicked in the last day than
  on a normal day of the week before (`rage_clicks`);
* speed: a page whose median load in the last day is at least twice the week
  before's (`slow_page`).

Plans without AI insights get `FREE_KINDS` only. A kind is raised at most once
per site per `REPEAT_AFTER`, and every alert is kept in `alerts` for the
dashboard's Alerts page.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from statistics import median
from typing import Any

from ..db import query, query_one
from .event_service import URL_PATH_SQL

WINDOW = timedelta(hours=3)
BASELINE_WEEKS = 4
MIN_NORMAL_SESSIONS = 10  # per WINDOW; below this the numbers are noise
DROP_RATIO = 0.5  # at most half of normal
SPIKE_RATIO = 2.0
MIN_SPIKE_EXTRA = 20

ERROR_LOOKBACK = timedelta(days=7)
NEW_ERROR_MIN_VISITORS = 3

DAY = timedelta(days=1)
RAGE_MIN_VISITORS = 5
RAGE_RATIO = 3

SLOW_MIN_SAMPLES = 10
SLOW_BASELINE_SAMPLES = 20
SLOW_RATIO = 2
SLOW_MIN_MS = 2500

REPEAT_AFTER = timedelta(hours=24)
MAX_RECORDINGS = 3
KEEP_FOR = timedelta(days=90)

FREE_KINDS = frozenset({"traffic_drop", "silent"})
# The other kinds come with AI insights (Pro and Agency)
PAID_FEATURE = "insights"

# Settings → Notifications switch that covers each kind (all on unless turned off)
PREFERENCE_FOR_KIND = {
    "traffic_drop": "trafficAlerts",
    "traffic_spike": "trafficAlerts",
    "silent": "trafficAlerts",
    "new_error": "errorAlerts",
    "rage_clicks": "rageClickAlerts",
    "slow_page": "speedAlerts",
}

# One error whatever the query string in a URL it quotes; as on the Errors page
ERROR_MESSAGE_SQL = (
    "regexp_replace(data->>'message', '(https?://[^\\s?#''\"]*)[?#][^\\s''\"]*', '\\1', 'g')"
)


@dataclass
class Alert:
    kind: str
    title: str
    message: str
    link: str
    # Sessions that show the problem; their recordings are attached when raised
    sessions: list[str] = field(default_factory=list)
    recordings: list[str] = field(default_factory=list)
    id: str | None = None


def _hours() -> int:
    return int(WINDOW.total_seconds() // 3600)


def judge_traffic(
    domain: str, current: int, past: Sequence[int], now: datetime, top_source: str | None = None
) -> Alert | None:
    """Sessions in the last window against the same window in past weeks."""
    normal = round(median(past)) if past else 0
    if normal < MIN_NORMAL_SESSIONS:
        return None
    day = now.strftime("%A")
    if current == 0:
        return Alert(
            "silent",
            f"{domain} has stopped sending data",
            f"No visits were recorded in the last {_hours()} hours, when a normal {day} has "
            f"about {normal} at this time. The tracking code may have been removed or broken.",
            "/dashboard/tracking",
        )
    if current <= normal * DROP_RATIO:
        return Alert(
            "traffic_drop",
            f"Traffic is down {round((1 - current / normal) * 100)}% on {domain}",
            f"{current} sessions in the last {_hours()} hours, against about {normal} at this "
            f"time on a normal {day}.",
            "/dashboard/traffic/trends",
        )
    if current >= normal * SPIKE_RATIO and current - normal >= MIN_SPIKE_EXTRA:
        source = f" Most of them came from {top_source}." if top_source else ""
        return Alert(
            "traffic_spike",
            f"Traffic is {current / normal:.1f}× higher than usual on {domain}",
            f"{current} sessions in the last {_hours()} hours, against about {normal} at this "
            f"time on a normal {day}.{source}",
            "/dashboard/traffic/sources",
        )
    return None


def judge_new_errors(domain: str, rows: Sequence[dict[str, Any]]) -> Alert | None:
    """`rows`: errors not seen in the week before, most visitors first."""
    rows = [r for r in rows if int(r["visitors"]) >= NEW_ERROR_MIN_VISITORS]
    if not rows:
        return None
    top = rows[0]
    message = str(top["message"])
    short = message if len(message) <= 120 else message[:117] + "…"
    others = len(rows) - 1
    more = f" {others} other new error{'s' if others > 1 else ''} started too." if others else ""
    return Alert(
        "new_error",
        f"A new error is hitting visitors on {domain}",
        f"\"{short}\" started in the last {_hours()} hours on {top['page'] or '/'} and hit "
        f"{top['visitors']} visitors. It didn't happen in the week before.{more}",
        "/dashboard/errors",
        sessions=list(top.get("session_ids") or []),
    )


def judge_rage_clicks(domain: str, rows: Sequence[dict[str, Any]]) -> Alert | None:
    """`rows`: per page, visitors who rage-clicked in the last day and the 7 before."""
    worst = None
    for r in rows:
        today, week = int(r["today"]), int(r["week"])
        if today >= RAGE_MIN_VISITORS and today >= RAGE_RATIO * max(week / 7, 1):
            if worst is None or today > int(worst["today"]):
                worst = r
    if worst is None:
        return None
    element = f" on \"{worst['element']}\"" if worst.get("element") else ""
    return Alert(
        "rage_clicks",
        f"Visitors are rage-clicking on {worst['page']}",
        f"{worst['today']} visitors clicked repeatedly{element} on {worst['page']} of {domain} "
        f"in the last day, against about {round(int(worst['week']) / 7)} a day the week before. "
        "Something there probably looks clickable but doesn't work.",
        "/dashboard/rage-clicks",
        sessions=list(worst.get("session_ids") or []),
    )


def judge_slow_pages(domain: str, rows: Sequence[dict[str, Any]]) -> Alert | None:
    """`rows`: per page, the median load time in the last day and the 7 before."""
    worst, worst_ratio = None, 0.0
    for r in rows:
        if r["now_ms"] is None or r["before_ms"] is None:
            continue
        now_ms, before_ms = float(r["now_ms"]), float(r["before_ms"])
        if (
            int(r["now_n"]) >= SLOW_MIN_SAMPLES
            and int(r["before_n"]) >= SLOW_BASELINE_SAMPLES
            and now_ms >= SLOW_MIN_MS
            and now_ms >= before_ms * SLOW_RATIO
            and now_ms / before_ms > worst_ratio
        ):
            worst, worst_ratio = r, now_ms / before_ms
    if worst is None:
        return None
    now_s, before_s = float(worst["now_ms"]) / 1000, float(worst["before_ms"]) / 1000
    return Alert(
        "slow_page",
        f"{worst['page']} got slower on {domain}",
        f"Half of visitors now wait {now_s:.1f}s or more for {worst['page']} to load, up from "
        f"{before_s:.1f}s the week before.",
        "/dashboard/performance",
    )


async def _traffic(domain_id: str, end: datetime) -> tuple[int, list[int], str | None]:
    start = end - WINDOW
    weeks = ", ".join(
        f"COUNT(*) FILTER (WHERE started_at >= $2 - INTERVAL '{7 * w} days' "
        f"AND started_at < $3 - INTERVAL '{7 * w} days')::int AS w{w}"
        for w in range(BASELINE_WEEKS + 1)
    )
    row = await query_one(
        f"""
        SELECT {weeks},
               (SELECT COALESCE(NULLIF(source, ''), 'direct visits') FROM sessions
                 WHERE domain_id = $1 AND started_at >= $2 AND started_at < $3
                 GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1) AS top_source
          FROM sessions
         WHERE domain_id = $1
           AND started_at >= $2 - INTERVAL '{7 * BASELINE_WEEKS} days' AND started_at < $3
        """,
        domain_id,
        start,
        end,
    )
    row = row or {}
    past = [int(row.get(f"w{w}") or 0) for w in range(1, BASELINE_WEEKS + 1)]
    return int(row.get("w0") or 0), past, row.get("top_source")


async def _new_errors(domain_id: str, end: datetime) -> list[dict[str, Any]]:
    start = end - WINDOW
    return await query(
        f"""
        WITH errors AS (
            SELECT {ERROR_MESSAGE_SQL} AS message, url, session_id, created_at
              FROM events
             WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'error'
               AND created_at >= $4 AND created_at < $3
               -- Browser extensions and in-app browsers throw from their own scripts
               AND COALESCE(NULLIF(data->>'source', ''), 'http:') ~* '^https?:'
        )
        SELECT message,
               COUNT(DISTINCT session_id)::int AS visitors,
               mode() WITHIN GROUP (ORDER BY {URL_PATH_SQL}) AS page,
               (array_agg(DISTINCT session_id::text))[1:20] AS session_ids
          FROM errors e
         WHERE created_at >= $2 AND message IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM errors seen WHERE seen.created_at < $2 AND seen.message = e.message
           )
         GROUP BY message
         ORDER BY visitors DESC
         LIMIT 5
        """,
        domain_id,
        start,
        end,
        start - ERROR_LOOKBACK,
    )


async def _rage_clicks(domain_id: str, end: datetime) -> list[dict[str, Any]]:
    return await query(
        f"""
        SELECT {URL_PATH_SQL} AS page,
               COUNT(DISTINCT session_id) FILTER (WHERE created_at >= $2)::int AS today,
               COUNT(DISTINCT session_id) FILTER (WHERE created_at < $2)::int AS week,
               mode() WITHIN GROUP (
                   ORDER BY COALESCE(NULLIF(data->>'text', ''), data->>'tag')
               ) FILTER (WHERE created_at >= $2) AS element,
               (array_agg(DISTINCT session_id::text) FILTER (WHERE created_at >= $2))[1:20]
                   AS session_ids
          FROM events
         WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'rage_click'
           AND created_at >= $3 AND created_at < $4
         GROUP BY 1
        """,
        domain_id,
        end - DAY,
        end - DAY * 8,
        end,
    )


async def _slow_pages(domain_id: str, end: datetime) -> list[dict[str, Any]]:
    return await query(
        f"""
        SELECT page,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE recent) AS now_ms,
               COUNT(*) FILTER (WHERE recent)::int AS now_n,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE NOT recent)
                   AS before_ms,
               COUNT(*) FILTER (WHERE NOT recent)::int AS before_n
          FROM (
              SELECT {URL_PATH_SQL} AS page, created_at >= $2 AS recent,
                     CASE WHEN COALESCE(data->>'lcp', data->>'loadTime') ~ '^[0-9]+(\\.[0-9]+)?$'
                          THEN COALESCE(data->>'lcp', data->>'loadTime')::float8 END AS ms
                FROM events
               WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'performance'
                 AND created_at >= $3 AND created_at < $4
          ) p
         WHERE ms > 0
         GROUP BY page
        """,
        domain_id,
        end - DAY,
        end - DAY * 8,
        end,
    )


async def _recordings(domain_id: str, session_ids: Sequence[str]) -> list[str]:
    if not session_ids:
        return []
    rows = await query(
        "SELECT id::text AS id FROM session_recordings "
        "WHERE domain_id = $1 AND session_id::text = ANY($2::text[]) "
        "ORDER BY started_at DESC LIMIT $3",
        domain_id,
        list(session_ids),
        MAX_RECORDINGS,
    )
    return [r["id"] for r in rows]


async def _raise(domain_id: str, alert: Alert, now: datetime) -> bool:
    """Store the alert unless one of its kind was raised for the site recently."""
    alert.recordings = await _recordings(domain_id, alert.sessions)
    row = await query_one(
        """
        INSERT INTO alerts (domain_id, kind, title, message, link, recordings)
        SELECT $1, $2, $3, $4, $5, $6::jsonb
         WHERE NOT EXISTS (
             SELECT 1 FROM alerts WHERE domain_id = $1 AND kind = $2 AND created_at > $7
         )
        RETURNING id::text AS id
        """,
        domain_id,
        alert.kind,
        alert.title,
        alert.message,
        alert.link,
        alert.recordings,
        now - REPEAT_AFTER,
    )
    if row:
        alert.id = row["id"]
    return row is not None


async def check_domain(domain: dict[str, Any], paid: bool, end: datetime) -> list[Alert]:
    """Run the checks for one site up to `end` (the top of the hour); returns the
    alerts newly raised."""
    domain_id, name = str(domain["id"]), str(domain["domain"])
    current, past, top_source = await _traffic(domain_id, end)
    found = [judge_traffic(name, current, past, end, top_source)]
    if paid:
        found += [
            judge_new_errors(name, await _new_errors(domain_id, end)),
            judge_rage_clicks(name, await _rage_clicks(domain_id, end)),
            judge_slow_pages(name, await _slow_pages(domain_id, end)),
        ]
    raised = []
    for alert in found:
        if alert and (paid or alert.kind in FREE_KINDS) and await _raise(domain_id, alert, end):
            raised.append(alert)
    return raised


async def remove_old(now: datetime) -> None:
    await query("DELETE FROM alerts WHERE created_at < $1 RETURNING 1", now - KEEP_FOR)


async def list_for_domain(domain_id: str, limit: int = 50) -> list[dict[str, Any]]:
    rows = await query(
        "SELECT id::text AS id, kind, title, message, link, recordings, created_at "
        "FROM alerts WHERE domain_id = $1 ORDER BY created_at DESC LIMIT $2",
        domain_id,
        limit,
    )
    return [
        {
            "id": r["id"],
            "kind": r["kind"],
            "title": r["title"],
            "message": r["message"],
            "link": r["link"],
            "recordings": r["recordings"] or [],
            "createdAt": r["created_at"],
        }
        for r in rows
    ]
