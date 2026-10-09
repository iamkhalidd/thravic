"""Hourly traffic-spike alerts — port of `jobs/trafficAlert.ts`.

Runs at minute 0 of every hour (`node-cron` pattern `0 * * * *`), compares each
domain's session count for the last hour against the hour before it, and emails
the owner when traffic rose or fell by more than 50%.

`previous === 0` is a special case: Express skips the percentage maths entirely
and only alerts when the current hour exceeded 50 sessions.
"""

from __future__ import annotations

from datetime import UTC
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..js_compat import js_round
from ..logging import create_logger
from ..services.email_service import send_traffic_alert_email

log = create_logger("Job")

SPIKE_THRESHOLD = 0.5
COLD_START_MINIMUM = 50
MINIMUM_HOURLY_TRAFFIC = 10

TRAFFIC_QUERY = """
WITH current_hour AS (
    SELECT domain_id, COUNT(*) as count
    FROM sessions
    WHERE started_at >= NOW() - INTERVAL '1 hour'
    GROUP BY domain_id
),
previous_hour AS (
    SELECT domain_id, COUNT(*) as count
    FROM sessions
    WHERE started_at >= NOW() - INTERVAL '2 hours'
      AND started_at < NOW() - INTERVAL '1 hour'
    GROUP BY domain_id
)
SELECT
    d.domain,
    u.email,
    COALESCE(curr.count, 0) as current_count,
    COALESCE(prev.count, 0) as previous_count
FROM domains d
JOIN users u ON d.user_id = u.id
LEFT JOIN current_hour curr ON d.id = curr.domain_id
LEFT JOIN previous_hour prev ON d.id = prev.domain_id
WHERE (COALESCE(curr.count, 0) > 10 OR COALESCE(prev.count, 0) > 10)
  -- Settings → Notifications → Traffic alerts (on unless turned off)
  AND COALESCE((u.preferences->'notifications'->>'trafficAlerts')::boolean, true)
"""


async def send_alert(to: str, domain: str, alert_type: str, message: str) -> None:
    """`alert_type` is "Traffic Spike" or "Traffic Drop"."""
    kind = "drop" if "drop" in alert_type.lower() else "spike"
    await send_traffic_alert_email(to, domain, kind, message)


async def check_traffic_spikes() -> None:
    results: list[dict[str, Any]] = await query(TRAFFIC_QUERY)

    for row in results:
        domain = row["domain"]
        email = row["email"]
        # int8 arrives as a string from the asyncpg codec, so `int()` is the
        # equivalent of the source's `parseInt()`.
        current = int(row["current_count"] or 0)
        previous = int(row["previous_count"] or 0)

        if previous == 0:
            if current > COLD_START_MINIMUM:
                await send_alert(
                    email,
                    domain,
                    "Traffic Spike",
                    f"Traffic went from 0 to {current} sessions in the last hour.",
                )
            continue

        change = (current - previous) / previous

        if change > SPIKE_THRESHOLD:
            await send_alert(
                email,
                domain,
                "Traffic Spike",
                f"Traffic up {js_round(change * 100)}% ({previous} -> {current})",
            )
        elif change < -SPIKE_THRESHOLD:
            await send_alert(
                email,
                domain,
                "Traffic Drop",
                f"Traffic down {js_round(abs(change) * 100)}% ({previous} -> {current})",
            )


def start_traffic_alert_job(scheduler: AsyncIOScheduler) -> None:
    """Schedule the hourly check. Mirrors `startTrafficAlertJob()`."""
    log.info("[Jobs] Starting Traffic Alert job (runs hourly)")

    scheduler.add_job(
        _scheduled_check,
        trigger=CronTrigger(minute=0, timezone=UTC),
        id="traffic_alert",
        replace_existing=True,
    )


async def _scheduled_check() -> None:
    log.info("[Jobs] Running Traffic Alert check...")
    try:
        await check_traffic_spikes()
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Traffic Alert failed: {exc}")
