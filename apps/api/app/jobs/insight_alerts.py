"""AI insight alerts (Settings → Notifications → AI insight alerts).

Once a day from 09:00 UTC, for owners on a plan with AI insights who have the
alerts on (the default), today's report for each site is read — generated now
if nobody opened Insights yet, the same report the dashboard then shows — and
its high-priority insights are emailed, one email per site. An insight with the
same title is not sent again for that site within `REPEAT_AFTER`, so a problem
that persists doesn't arrive every morning. Claims live in `notification_log`
and are released if delivery fails.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from ..services import insight_service, plan_catalog
from ..services.email_service import send_insight_alert_email
from ..services.plan_service import entitled
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "insight_alerts"
RUN_EVERY = timedelta(hours=23)
KIND = "insight"
SEND_FROM_HOUR = 9  # UTC
REPEAT_AFTER = timedelta(days=7)
MAX_PER_EMAIL = 3

RECIPIENTS_QUERY = f"""
SELECT u.id, u.email, u.name, COALESCE(LOWER(s.plan), 'free') AS plan
FROM users u
LEFT JOIN LATERAL (
    SELECT plan FROM subscriptions
    WHERE user_id = u.id AND {entitled()}
    ORDER BY created_at DESC LIMIT 1
) s ON TRUE
WHERE COALESCE(u.role, 'user') <> 'suspended'
  AND u.restricted_at IS NULL
  AND COALESCE((u.preferences->'notifications'->>'insightAlerts')::boolean, true)
  AND EXISTS (SELECT 1 FROM domains d WHERE d.user_id = u.id)
"""


async def send_insight_alerts() -> dict[str, Any]:
    now = datetime.now(UTC)
    await query(
        "DELETE FROM notification_log WHERE kind = $1 AND sent_at < $2 RETURNING 1",
        KIND,
        now - REPEAT_AFTER,
    )

    sent = failed = 0
    for user in await query(RECIPIENTS_QUERY):
        plan = await plan_catalog.get(user["plan"])
        if "insights" not in plan.features:
            continue
        for domain in await query(
            "SELECT id, domain FROM domains WHERE user_id = $1 ORDER BY domain", user["id"]
        ):
            try:
                report = await insight_service.todays_report(dict(domain))
            except Exception as exc:  # noqa: BLE001 — one site must not stop the rest
                log.error(f"[Jobs] Insights for {domain['domain']} failed: {exc}")
                continue
            if report.get("status") != "ok":
                continue
            high = [i for i in (report.get("insights") or []) if i.get("priority") == "high"]
            if not high:
                continue

            keys = [f"{domain['id']}:{i['title']}" for i in high]
            claimed = {
                r["key"]
                for r in await query(
                    "INSERT INTO notification_log (user_id, kind, key) "
                    "SELECT $1, $2, k FROM unnest($3::text[]) AS k "
                    "ON CONFLICT DO NOTHING RETURNING key",
                    user["id"],
                    KIND,
                    keys,
                )
            }
            fresh = [i for i, k in zip(high, keys, strict=True) if k in claimed][:MAX_PER_EMAIL]
            if not fresh:
                continue
            try:
                await send_insight_alert_email(user["email"], user["name"], domain["domain"], fresh)
                sent += 1
            except Exception as exc:  # noqa: BLE001 — release the claims and retry tomorrow
                failed += 1
                log.error(f"[Jobs] Insight alert to {user['email']} failed: {exc}")
                await query(
                    "DELETE FROM notification_log "
                    "WHERE user_id = $1 AND kind = $2 AND key = ANY($3::text[]) RETURNING 1",
                    user["id"],
                    KIND,
                    list(claimed),
                )

    return {"sent": sent, "failed": failed}


async def _scheduled_alerts() -> None:
    # Checked before run_if_due so an early-morning tick isn't recorded as the day's run
    if datetime.now(UTC).hour < SEND_FROM_HOUR:
        return
    try:
        await run_if_due(JOB_NAME, RUN_EVERY, send_insight_alerts)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Insight alerts failed: {exc}")


def start_insight_alert_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting insight alert job (daily)")
    scheduler.add_job(
        _scheduled_alerts,
        trigger=CronTrigger(minute=27, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
    )
