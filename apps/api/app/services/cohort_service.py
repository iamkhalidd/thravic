"""Visitor retention: of the people who first came in a week, how many came back.

Each visitor belongs to the week (Monday, UTC) of `visitors.first_seen`, which
survives data retention, so a visitor whose old sessions were removed is not
counted as new again. "Came back in week N" means at least one session in the
Nth week after that one; week 0 is everyone.

Not to be confused with `retention_service`, which deletes data past a plan's
retention period.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from ..db import query

DEFAULT_WEEKS = 8
MAX_WEEKS = 12


def week_start(moment: datetime) -> datetime:
    """Monday 00:00 UTC of `moment`'s week."""
    moment = moment.astimezone(UTC)
    return (moment - timedelta(days=moment.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )


def build_cohorts(
    sizes: dict[datetime, int],
    returns: list[dict[str, Any]],
    now: datetime,
    weeks: int,
) -> dict[str, Any]:
    """The cohort table and the two headline rates.

    `sizes` is new visitors per cohort week; `returns` rows are
    `{week, offset, visitors}` for offsets of 1 and more. A cohort only reports
    the weeks that have started; a rate only counts cohorts whose week is over,
    so this week's partial numbers don't drag it down.
    """
    current = week_start(now)
    first = current - timedelta(weeks=weeks - 1)
    returned: dict[tuple[datetime, int], int] = {
        (week_start(row["week"]), int(row["offset"])): int(row["visitors"]) for row in returns
    }

    cohorts = []
    for index in range(weeks):
        week = first + timedelta(weeks=index)
        size = sizes.get(week, 0)
        elapsed = (current - week).days // 7
        retention = []
        for offset in range(1, elapsed + 1):
            count = returned.get((week, offset), 0)
            retention.append(
                {"count": count, "percent": round(count / size * 100, 1) if size else 0}
            )
        cohorts.append({"week": week.date().isoformat(), "visitors": size, "weeks": retention})

    def rate(offset: int) -> float | None:
        # Cohorts whose `offset` week has fully passed
        done = [c for c in cohorts if len(c["weeks"]) > offset]
        total = sum(c["visitors"] for c in done)
        if not total:
            return None
        came_back = sum(c["weeks"][offset - 1]["count"] for c in done)
        return round(came_back / total * 100, 1)

    return {"cohorts": cohorts, "week1": rate(1), "week4": rate(4)}


async def cohorts(domain_id: Any, weeks: int = DEFAULT_WEEKS, now: datetime | None = None):
    now = now or datetime.now(UTC)
    since = week_start(now) - timedelta(weeks=weeks - 1)

    size_rows = await query(
        """
        SELECT date_trunc('week', first_seen AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS week,
               COUNT(*)::int AS visitors
        FROM visitors
        WHERE domain_id = $1 AND first_seen >= $2
        GROUP BY 1
        """,
        domain_id,
        since,
    )
    return_rows = await query(
        """
        WITH cohort AS (
            SELECT id,
                   date_trunc('week', first_seen AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS week
            FROM visitors
            WHERE domain_id = $1 AND first_seen >= $2
        ),
        visits AS (
            SELECT DISTINCT c.id, c.week,
                   (EXTRACT(EPOCH FROM (
                       date_trunc('week', s.started_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                       - c.week
                   )) / 604800)::int AS "offset"
            FROM cohort c
            JOIN sessions s ON s.visitor_id = c.id AND s.domain_id = $1
            WHERE s.started_at >= c.week
        )
        SELECT week, "offset", COUNT(*)::int AS visitors
        FROM visits
        WHERE "offset" > 0
        GROUP BY week, "offset"
        """,
        domain_id,
        since,
    )
    sizes = {week_start(row["week"]): int(row["visitors"]) for row in size_rows}
    return build_cohorts(sizes, return_rows, now, weeks)
