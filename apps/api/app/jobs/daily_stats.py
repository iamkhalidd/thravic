"""Keep `daily_domain_stats`: events, pageviews and sessions per site per day.

The admin overview's charts used to count the raw `events` table on every load,
which grows with every customer. This job counts each day once and the panel
reads the small table instead.

Days are calendar days in the report time zone (Lagos by default). Each hourly
run recounts today and yesterday (yesterday so events that arrive just after
midnight, or late from a phone that was offline, still land). The first run, or
one after the table was emptied, fills the last BACKFILL_DAYS days.

Counting goes one site at a time, so each count uses the (domain_id,
created_at) index rather than scanning every event.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query, query_one
from ..logging import create_logger
from ..services.revenue_service import report_tz_name, report_zone
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "daily_domain_stats"
RUN_EVERY = timedelta(minutes=55)
BACKFILL_DAYS = 90

UPSERT_SQL = """
INSERT INTO daily_domain_stats (day, domain_id, events, pageviews, sessions, updated_at)
SELECT $2::date, $1::uuid,
       (SELECT COUNT(*) FROM events e
         WHERE e.domain_id = $1 AND e.created_at >= $3 AND e.created_at < $4),
       (SELECT COUNT(*) FROM events e
         WHERE e.domain_id = $1 AND e.created_at >= $3 AND e.created_at < $4
           AND e.type = 'pageview'),
       (SELECT COUNT(*) FROM sessions s
         WHERE s.domain_id = $1 AND s.started_at >= $3 AND s.started_at < $4),
       NOW()
ON CONFLICT (day, domain_id) DO UPDATE
SET events = EXCLUDED.events, pageviews = EXCLUDED.pageviews,
    sessions = EXCLUDED.sessions, updated_at = NOW()
"""


def day_bounds(day: date) -> tuple[datetime, datetime]:
    """Start and end of a report-zone calendar day, as UTC instants."""
    zone = report_zone()
    start = datetime(day.year, day.month, day.day, tzinfo=zone)
    end = start + timedelta(days=1)
    return start.astimezone(UTC), end.astimezone(UTC)


def report_today() -> date:
    return datetime.now(report_zone()).date()


async def refresh_daily_stats() -> dict[str, Any]:
    today = report_today()
    has_rows = await query_one("SELECT 1 AS x FROM daily_domain_stats LIMIT 1")
    span = 2 if has_rows else BACKFILL_DAYS
    days = [today - timedelta(days=n) for n in range(span)]

    domains = await query("SELECT id, created_at FROM domains")
    written = 0
    for domain in domains:
        # No need to count days before the site existed.
        created = (domain.get("created_at") or datetime.now(UTC)).astimezone(report_zone()).date()
        for day in days:
            if day < created:
                continue
            start, end = day_bounds(day)
            await query(UPSERT_SQL, domain["id"], day, start, end)
            written += 1
    return {"days": span, "domains": len(domains), "rows": written, "timezone": report_tz_name()}


async def _scheduled() -> None:
    try:
        await run_if_due(JOB_NAME, RUN_EVERY, refresh_daily_stats)
    except Exception as exc:  # noqa: BLE001 - a failed run must not stop the schedule
        log.error(f"[Jobs] Daily stats failed: {exc}")


def start_daily_stats_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting daily stats job (hourly)")
    scheduler.add_job(
        _scheduled,
        trigger=CronTrigger(minute=13, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
    )
