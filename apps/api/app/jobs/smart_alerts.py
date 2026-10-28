"""Hourly smart alerts (Settings → Notifications: traffic, error, rage-click and speed alerts).

Every hour, each site of an active account is checked by `alert_service` up to
the top of the hour. New alerts are stored for the dashboard's Alerts page
whatever the owner's settings, and the ones whose switch is on (all are, unless
turned off) go out in one email per owner, however many sites they cover. The
site's webhooks subscribed to `alert` (Slack and Zapier included) get them all.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from ..services import alert_service, plan_catalog, webhook_service
from ..services.email_service import send_alerts_email
from ..services.plan_service import entitled
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "smart_alerts"
EVERY = timedelta(minutes=50)

SITES_QUERY = f"""
SELECT d.id, d.domain, u.id AS user_id, u.email, u.name,
       u.preferences->'notifications' AS notifications,
       COALESCE(LOWER(s.plan), 'free') AS plan
FROM domains d
JOIN users u ON u.id = d.user_id
LEFT JOIN LATERAL (
    SELECT plan FROM subscriptions
    WHERE user_id = u.id AND {entitled()}
    ORDER BY created_at DESC LIMIT 1
) s ON TRUE
WHERE COALESCE(u.role, 'user') <> 'suspended'
  AND u.restricted_at IS NULL
ORDER BY u.id, d.domain
"""


def wants(notifications: Any, kind: str) -> bool:
    """Whether the owner's switch for this kind is on; on unless turned off."""
    key = alert_service.PREFERENCE_FOR_KIND.get(kind)
    return not isinstance(notifications, dict) or notifications.get(key) is not False


async def check_sites() -> dict[str, Any]:
    end = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    await alert_service.remove_old(end)

    raised = emailed = 0
    by_owner: dict[str, dict[str, Any]] = {}
    for site in await query(SITES_QUERY):
        plan = await plan_catalog.get(site["plan"])
        try:
            alerts = await alert_service.check_domain(
                dict(site), alert_service.PAID_FEATURE in plan.features, end
            )
        except Exception as exc:  # noqa: BLE001 — one site must not stop the rest
            log.error(f"[Jobs] Smart alerts for {site['domain']} failed: {exc}")
            continue
        raised += len(alerts)
        if alerts:
            # Webhooks, Slack and Zapier get every new alert, whatever the email switches
            await webhook_service.trigger_for_events(
                str(site["id"]),
                [("alert", alert_service.webhook_data(site["domain"], str(site["id"]), a))
                 for a in alerts],
            )
        owner = by_owner.setdefault(
            str(site["user_id"]), {"email": site["email"], "name": site["name"], "alerts": []}
        )
        owner["alerts"] += [
            {"domain": site["domain"], "domain_id": str(site["id"]), "alert": a}
            for a in alerts
            if wants(site["notifications"], a.kind)
        ]

    for owner in by_owner.values():
        if owner["alerts"]:
            await send_alerts_email(owner["email"], owner["name"], owner["alerts"])
            emailed += 1

    return {"raised": raised, "emailed": emailed}


def start_smart_alert_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting smart alert job (hourly)")
    scheduler.add_job(
        _scheduled_check,
        trigger=CronTrigger(minute=5, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
        # Also check soon after start: the host sleeps when idle
        next_run_time=datetime.now(UTC) + timedelta(minutes=2),
    )


async def _scheduled_check() -> None:
    try:
        await run_if_due(JOB_NAME, EVERY, check_sites)
    except Exception as exc:  # noqa: BLE001 — a failed run must not stop the schedule
        log.error(f"[Jobs] Smart alerts failed: {exc}")
