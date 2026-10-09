"""Monday's weekly report (Settings → Notifications → Weekly report).

Every Monday from 08:00 UTC, each owner who has the report on (the default) gets
one email covering the last full week (Monday to Sunday, UTC) for each of their
sites, every number set against the week before. Owners whose sites had no
traffic in either week are skipped. Sending is claimed in `notification_log`
under the ISO week first, and the claim is released if delivery fails so the
next hourly run tries again.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from ..services.email_service import send_weekly_report_email
from ..services.event_service import URL_PATH_SQL
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "weekly_report"
RUN_EVERY = timedelta(minutes=55)
KIND = "weekly_report"
SEND_FROM_HOUR = 8  # UTC, Mondays

RECIPIENTS_QUERY = """
SELECT u.id, u.email, u.name
FROM users u
WHERE COALESCE(u.role, 'user') <> 'suspended'
  AND u.restricted_at IS NULL
  AND COALESCE((u.preferences->'notifications'->>'weeklyReport')::boolean, true)
  AND EXISTS (SELECT 1 FROM domains d WHERE d.user_id = u.id)
  AND NOT EXISTS (
      SELECT 1 FROM notification_log n
      WHERE n.user_id = u.id AND n.kind = $1 AND n.key = $2
  )
"""

# Visitors and sessions per site for this week and the one before ($2..$3..$4).
SESSIONS_QUERY = """
SELECT d.id, d.domain,
       COUNT(DISTINCT s.visitor_id) FILTER (WHERE s.started_at >= $3)::int AS visitors,
       COUNT(DISTINCT s.visitor_id) FILTER (WHERE s.started_at < $3)::int AS visitors_before,
       COUNT(s.session_id) FILTER (WHERE s.started_at >= $3)::int AS sessions,
       COUNT(s.session_id) FILTER (WHERE s.started_at < $3)::int AS sessions_before
FROM domains d
LEFT JOIN sessions s ON s.domain_id = d.id AND s.started_at >= $2 AND s.started_at < $4
WHERE d.user_id = $1
GROUP BY d.id, d.domain
ORDER BY d.domain
"""

PAGEVIEWS_QUERY = """
SELECT domain_id,
       COUNT(*) FILTER (WHERE created_at >= $2)::int AS pageviews,
       COUNT(*) FILTER (WHERE created_at < $2)::int AS pageviews_before
FROM events
WHERE domain_id = ANY($1::uuid[]) AND type = 'pageview'
  AND created_at >= $3 AND created_at < $4
GROUP BY domain_id
"""

TOP_PAGE_QUERY = f"""
SELECT DISTINCT ON (domain_id) domain_id, path
FROM (
    SELECT domain_id, {URL_PATH_SQL} AS path, COUNT(*) AS views
    FROM events
    WHERE domain_id = ANY($1::uuid[]) AND type = 'pageview'
      AND created_at >= $2 AND created_at < $3
    GROUP BY 1, 2
) p
ORDER BY domain_id, views DESC, path
"""

TOP_SOURCE_QUERY = """
SELECT DISTINCT ON (domain_id) domain_id, source
FROM (
    SELECT domain_id, COALESCE(NULLIF(source, ''), 'Direct') AS source, COUNT(*) AS n
    FROM sessions
    WHERE domain_id = ANY($1::uuid[]) AND started_at >= $2 AND started_at < $3
    GROUP BY 1, 2
) s
ORDER BY domain_id, n DESC, source
"""


def report_week(now: datetime) -> tuple[datetime, datetime, str] | None:
    """`(start, end, iso_week)` of the week to report, or None if it isn't time yet."""
    if now.weekday() != 0 or now.hour < SEND_FROM_HOUR:
        return None
    end = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = end - timedelta(days=7)
    year, week, _ = start.isocalendar()
    return start, end, f"{year}-W{week:02d}"


async def site_stats(user_id: Any, start: datetime, end: datetime) -> list[dict[str, Any]]:
    """Each of the owner's sites for [start, end) with the week before."""
    before = start - timedelta(days=7)
    sites = [dict(r) for r in await query(SESSIONS_QUERY, user_id, before, start, end)]
    ids = [s["id"] for s in sites]
    if not ids:
        return []
    views = {r["domain_id"]: r for r in await query(PAGEVIEWS_QUERY, ids, start, before, end)}
    pages = {r["domain_id"]: r["path"] for r in await query(TOP_PAGE_QUERY, ids, start, end)}
    sources = {r["domain_id"]: r["source"] for r in await query(TOP_SOURCE_QUERY, ids, start, end)}
    for site in sites:
        v = views.get(site["id"]) or {}
        site["pageviews"] = int(v.get("pageviews") or 0)
        site["pageviews_before"] = int(v.get("pageviews_before") or 0)
        site["top_page"] = pages.get(site["id"])
        site["top_source"] = sources.get(site["id"])
    return sites


async def send_weekly_reports(now: datetime | None = None) -> dict[str, Any]:
    week = report_week(now or datetime.now(UTC))
    if week is None:
        return {"skipped": "not Monday morning"}
    start, end, key = week

    sent = skipped = failed = 0
    for user in await query(RECIPIENTS_QUERY, KIND, key):
        sites = await site_stats(user["id"], start, end)
        if not any(
            s["sessions"] or s["sessions_before"] or s["pageviews"] or s["pageviews_before"]
            for s in sites
        ):
            skipped += 1
            continue

        claimed = await query(
            "INSERT INTO notification_log (user_id, kind, key) VALUES ($1, $2, $3) "
            "ON CONFLICT DO NOTHING RETURNING 1",
            user["id"],
            KIND,
            key,
        )
        if not claimed:
            continue
        try:
            await send_weekly_report_email(user["email"], user["name"], sites, start, end)
            sent += 1
        except Exception as exc:  # noqa: BLE001 — release the claim and retry next run
            failed += 1
            log.error(f"[Jobs] Weekly report to {user['email']} failed: {exc}")
            await query(
                "DELETE FROM notification_log WHERE user_id = $1 AND kind = $2 AND key = $3",
                user["id"],
                KIND,
                key,
            )

    return {"week": key, "sent": sent, "skipped": skipped, "failed": failed}


async def _scheduled_reports() -> None:
    try:
        await run_if_due(JOB_NAME, RUN_EVERY, send_weekly_reports)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Weekly reports failed: {exc}")


def start_weekly_report_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting weekly report job (hourly, sends Mondays)")
    scheduler.add_job(
        _scheduled_reports,
        trigger=CronTrigger(minute=17, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
    )
