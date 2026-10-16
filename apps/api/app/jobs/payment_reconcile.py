"""Finish payments the webhook and the browser both missed.

A checkout writes a `pending` row in `payment_history`. Normally Paystack's
webhook or the customer's browser (`/verify`) turns it into `success` within
seconds. If both fail (the API was asleep, the customer closed the tab), the
customer paid and has no plan. Each hourly run asks Paystack about pending rows
from the last few days:

- paid: apply it like the webhook would, and tell the owner it was recovered;
- failed, reversed or abandoned (after an hour): mark the row so it stops being checked;
- anything else: leave it for the next run.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import query
from ..logging import create_logger
from ..services import email_service, paystack_service
from .runner import run_if_due

log = create_logger("Job")

JOB_NAME = "payment_reconcile"
RUN_EVERY = timedelta(minutes=55)
FINAL_FAILURES = {"failed", "reversed"}

PENDING_SQL = """
SELECT ph.paystack_ref, ph.user_id, ph.plan, ph.amount, ph.currency, ph.created_at, u.email
FROM payment_history ph
LEFT JOIN users u ON u.id = ph.user_id
WHERE ph.status = 'pending'
  AND ph.paystack_ref IS NOT NULL
  AND ph.created_at < NOW() - INTERVAL '20 minutes'
  AND ph.created_at > NOW() - INTERVAL '3 days'
ORDER BY ph.created_at
LIMIT 100
"""


async def reconcile_pending_payments() -> dict[str, Any]:
    if not paystack_service.secret_key():
        return {"skipped": "PAYSTACK_SECRET_KEY is not set"}

    # Imported here: the payments router imports the jobs' services at load time.
    from ..routers.payments import _upgrade_subscription

    rows = await query(PENDING_SQL)
    recovered = closed = errors = 0
    for row in rows:
        reference = row["paystack_ref"]
        try:
            tx = await paystack_service.verify_transaction(reference)
        except Exception as exc:  # noqa: BLE001 - try the rest, retry this one next hour
            errors += 1
            log.warning(f"Could not check payment {reference}: {exc}")
            continue

        status = (tx or {}).get("status")
        if status == "success" and row["user_id"]:
            try:
                await _upgrade_subscription(
                    str(row["user_id"]), row["plan"], reference,
                    tx.get("amount"), tx.get("currency"),
                )
            except Exception as exc:  # noqa: BLE001 - the next run tries again
                errors += 1
                log.error(f"Could not apply recovered payment {reference}: {exc}")
                continue
            recovered += 1
            amount = (tx.get("amount") or 0) / 100
            await email_service.send_owner_system_alert(
                "A missed payment was applied",
                "A payment that never reached Thravic was found and applied",
                [
                    ("Account", row.get("email") or str(row["user_id"])),
                    ("Plan", str(row["plan"])),
                    ("Amount", f"{tx.get('currency') or row['currency']} {amount:,.2f}"),
                    ("Paystack reference", reference),
                    ("Why", "Neither the webhook nor the customer's browser confirmed it."),
                ],
            )
            continue

        age = row["created_at"].astimezone(UTC)
        abandoned_long_enough = age < datetime.now(UTC) - timedelta(hours=1)
        gave_up = status == "abandoned" and abandoned_long_enough
        if tx is None or status in FINAL_FAILURES or gave_up:
            final = status if status in FINAL_FAILURES else "abandoned"
            await query(
                "UPDATE payment_history SET status = $2 "
                "WHERE paystack_ref = $1 AND status = 'pending'",
                reference, final,
            )
            closed += 1

    return {"checked": len(rows), "recovered": recovered, "closed": closed, "errors": errors}


async def _scheduled() -> None:
    try:
        await run_if_due(JOB_NAME, RUN_EVERY, reconcile_pending_payments)
    except Exception as exc:  # noqa: BLE001 - a failed run must not stop the schedule
        log.error(f"[Jobs] Payment reconcile failed: {exc}")


def start_payment_reconcile_job(scheduler: AsyncIOScheduler) -> None:
    log.info("[Jobs] Starting payment reconcile job (hourly)")
    scheduler.add_job(
        _scheduled,
        trigger=CronTrigger(minute=21, timezone=UTC),
        id=JOB_NAME,
        replace_existing=True,
    )
