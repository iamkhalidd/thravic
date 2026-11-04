"""The daily anomaly scan: which of a site's numbers were unusual yesterday.

Each series below is counted per UTC day over the last `SCAN_DAYS` days and
checked with `ml.anomaly`: yesterday against what the site's own weekly
pattern predicted (`check_day`), and the last weeks against a month before
(`check_slide`). Series:

* sessions, for the whole site and its top channels, referrers, campaigns,
  devices, countries and landing pages;
* JavaScript errors;
* the site's own custom events (sign-ups, purchases, ...).

Series too small to judge (under `MIN_DAILY_MEAN` a day) are skipped. The
strongest `MAX_PER_DAY` findings are kept in `anomalies`, where AI insights
(`insight_facts`) and smart alerts (`alert_service`) read them with their own
queries (this module imports `insight_facts`, which imports `alert_service`).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Any

from ..db import query
from ..ml import anomaly, series
from .analyst_service import INTERNAL_EVENTS
from .event_service import URL_PATH_SQL
from .insight_facts import DIMENSIONS

SCAN_DAYS = anomaly.SLIDE_DAYS  # 8 weeks, ending with the day checked
TOP_KEYS = 5  # per dimension, by sessions over the scan
TOP_PAGES = 10
TOP_EVENTS = 5
MIN_DAILY_MEAN = 3.0
MAX_PER_DAY = 10
KEEP_FOR = timedelta(days=90)

# Smallest change that counts, per day, by metric
MIN_CHANGE = {"sessions": 10, "errors": 5, "event": 5}

LINKS = {
    "errors": "/dashboard/errors",
    "event": "/dashboard/funnels",
    "landing page": "/dashboard/behavior/pages",
    "site": "/dashboard/traffic/trends",
    **{name: link for name, _, link in DIMENSIONS},
}

_DAY_SQL = "(({column}) AT TIME ZONE 'UTC')::date"


def scan_window(day: date) -> tuple[date, datetime, datetime]:
    """The first day counted, and the UTC instants the scan for `day` covers."""
    first = day - timedelta(days=SCAN_DAYS - 1)
    start = datetime(first.year, first.month, first.day, tzinfo=UTC)
    return first, start, start + timedelta(days=SCAN_DAYS)


async def _counts(domain_id: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
    """Rows of (metric, dimension, key, day, n) for every series scanned."""
    day = _DAY_SQL.format(column="started_at")
    rows: list[dict[str, Any]] = []
    rows += await query(
        f"""
        SELECT 'sessions' AS metric, 'site' AS dimension, 'all' AS key, {day} AS day,
               COUNT(*)::int AS n
        FROM sessions WHERE domain_id = $1 AND started_at >= $2 AND started_at < $3
        GROUP BY 4
        """,
        domain_id,
        start,
        end,
    )
    for name, sql, _ in DIMENSIONS:
        rows += _top(
            await query(
                f"""
                SELECT 'sessions' AS metric, $4::text AS dimension, {sql} AS key, {day} AS day,
                       COUNT(*)::int AS n
                FROM sessions WHERE domain_id = $1 AND started_at >= $2 AND started_at < $3
                GROUP BY 3, 4
                """,
                domain_id,
                start,
                end,
                name,
            ),
            TOP_KEYS,
        )

    event_day = _DAY_SQL.format(column="created_at")
    rows += _top(
        await query(
            f"""
            WITH firsts AS (
                SELECT DISTINCT ON (session_id) created_at, {URL_PATH_SQL} AS path
                FROM events
                WHERE domain_id = $1 AND type = 'pageview' AND session_id IS NOT NULL
                  AND created_at >= $2 AND created_at < $3
                ORDER BY session_id, created_at
            )
            SELECT 'sessions' AS metric, 'landing page' AS dimension, path AS key,
                   {event_day} AS day, COUNT(*)::int AS n
            FROM firsts GROUP BY 3, 4
            """,
            domain_id,
            start,
            end,
        ),
        TOP_PAGES,
    )
    rows += await query(
        f"""
        SELECT 'errors' AS metric, 'site' AS dimension, 'all' AS key, {event_day} AS day,
               COUNT(*)::int AS n
        FROM events
        WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'error'
          AND created_at >= $2 AND created_at < $3
        GROUP BY 4
        """,
        domain_id,
        start,
        end,
    )
    events = await query(
        f"""
        SELECT 'event' AS metric, 'event' AS dimension, data->>'event' AS key,
               {event_day} AS day, COUNT(*)::int AS n
        FROM events
        WHERE domain_id = $1 AND type = 'custom' AND data->>'event' IS NOT NULL
          AND NOT (data->>'event' = ANY($4::text[]))
          AND created_at >= $2 AND created_at < $3
        GROUP BY 3, 4
        """,
        domain_id,
        start,
        end,
        sorted(INTERNAL_EVENTS),
    )
    rows += _top(events, TOP_EVENTS)
    return rows


def _top(rows: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """The rows of the `limit` keys with the most in total."""
    totals: dict[str, int] = defaultdict(int)
    for row in rows:
        if row["key"]:
            totals[row["key"]] += row["n"]
    keep = set(sorted(totals, key=lambda k: totals[k], reverse=True)[:limit])
    return [row for row in rows if row["key"] in keep]


def find(rows: list[dict[str, Any]], first: date, day: date) -> list[dict[str, Any]]:
    """The findings in `rows` (see `_counts`) for `day`, strongest first."""
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(row["metric"], row["dimension"], str(row["key"]))].append(row)

    found = []
    for (metric, dimension, key), group in grouped.items():
        values = series.trim_leading_zeros(series.daily_values(group, "n", first, day, "day"))
        if len(values) < 2 or sum(values[:-1]) / (len(values) - 1) < MIN_DAILY_MEAN:
            continue
        min_change = MIN_CHANGE[metric]
        for finding in (
            anomaly.check_day(values, min_change),
            anomaly.check_slide(values, min_change),
        ):
            if finding:
                found.append(
                    {
                        "metric": metric,
                        "dimension": dimension,
                        "key": key,
                        "link": LINKS.get(
                            metric if dimension == "site" else dimension, LINKS["site"]
                        ),
                        "finding": finding,
                    }
                )
    found.sort(key=lambda f: abs(f["finding"].score), reverse=True)
    return found[:MAX_PER_DAY]


async def scan_domain(domain_id: str, day: date) -> list[dict[str, Any]]:
    """Scan one site for `day` and store what was found (replacing an earlier scan)."""
    first, start, end = scan_window(day)
    found = find(await _counts(domain_id, start, end), first, day)
    await query(
        "DELETE FROM anomalies WHERE domain_id = $1 AND day = $2 RETURNING 1", domain_id, day
    )
    for f in found:
        a = f["finding"]
        await query(
            """
            INSERT INTO anomalies (domain_id, day, metric, dimension, key, kind, direction,
                                   actual, expected, low, high, score, change_pct, link)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT DO NOTHING
            RETURNING 1
            """,
            domain_id,
            day,
            f["metric"],
            f["dimension"],
            f["key"],
            a.kind,
            a.direction,
            a.actual,
            a.expected,
            a.low,
            a.high,
            a.score,
            a.change_pct,
            f["link"],
        )
    return found


async def remove_old(today: date) -> None:
    await query("DELETE FROM anomalies WHERE day < $1 RETURNING 1", today - KEEP_FOR)
