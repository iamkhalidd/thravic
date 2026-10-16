"""Talking to Paystack outside a customer's request: checks and alerts.

- `verify_transaction` asks Paystack what happened to one payment.
- `list_successful` pages through Paystack's successful transactions for a date
  range, for the admin's monthly check against Thravic's own records.
- `alert_owner_once` emails the owner about a payment problem, at most once an
  hour per kind of problem, so a burst of bad webhooks is one email, not fifty.
"""

from __future__ import annotations

import time
from collections.abc import Sequence
from datetime import datetime
from typing import Any
from urllib.parse import quote

import httpx

from ..config import get_settings
from ..logging import create_logger
from . import email_service

log = create_logger("Paystack")

PAYSTACK_BASE = "https://api.paystack.co"
TIMEOUT_SECONDS = 30.0
PAGE_SIZE = 100
# Paystack allows a lot more, but a month of a young business fits easily.
MAX_PAGES = 50
ALERT_EVERY_SECONDS = 60 * 60

# alert kind -> monotonic time it was last sent (per process).
_last_alert: dict[str, float] = {}


def secret_key() -> str:
    return get_settings().PAYSTACK_SECRET_KEY or ""


async def verify_transaction(reference: str) -> dict[str, Any] | None:
    """Paystack's record of one payment (`data` of /transaction/verify), or None
    when Paystack has no such reference."""
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(
            f"{PAYSTACK_BASE}/transaction/verify/{quote(reference, safe='')}",
            headers={"Authorization": f"Bearer {secret_key()}"},
        )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return (response.json() or {}).get("data")


async def list_successful(start: datetime, end: datetime) -> list[dict[str, Any]]:
    """Every successful Paystack transaction from `start` to `end`."""
    found: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        for page in range(1, MAX_PAGES + 1):
            response = await client.get(
                f"{PAYSTACK_BASE}/transaction",
                headers={"Authorization": f"Bearer {secret_key()}"},
                params={
                    "status": "success",
                    "from": start.isoformat(),
                    "to": end.isoformat(),
                    "perPage": PAGE_SIZE,
                    "page": page,
                },
            )
            response.raise_for_status()
            body = response.json() or {}
            rows = body.get("data") or []
            found.extend(rows)
            meta = body.get("meta") or {}
            page_count = int(meta.get("pageCount") or 1)
            if page >= page_count or not rows:
                break
    return found


async def alert_owner_once(
    kind: str, subject: str, heading: str, rows: Sequence[tuple[str, str]]
) -> None:
    """Email the owner about a payment problem unless `kind` was sent this hour."""
    now = time.monotonic()
    if now - _last_alert.get(kind, -ALERT_EVERY_SECONDS) < ALERT_EVERY_SECONDS:
        return
    _last_alert[kind] = now
    try:
        await email_service.send_owner_system_alert(subject, heading, rows)
    except Exception as exc:  # noqa: BLE001 - alerting must never break a payment path
        log.error(f"Owner alert {kind!r} failed: {exc}")
