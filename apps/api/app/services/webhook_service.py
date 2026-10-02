"""Outbound webhook delivery — port of `services/webhookService.ts`.

Fire-and-forget: delivery is scheduled as a background task and never awaited by
the caller, so the originating request is not blocked (or failed) by a slow or
dead subscriber endpoint.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import UTC, datetime
from typing import Any

import httpx

from ..db import query
from ..logging import create_logger

log = create_logger("Webhook")

DELIVERY_TIMEOUT_SECONDS = 5.0

# Node's `new Date().toISOString()` -> 2026-09-17T15:35:23.104Z
_ISO_MILLIS_LENGTH = 24


def _iso_timestamp() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


async def trigger_webhooks(domain_id: str, event: str, data: Any) -> None:
    try:
        webhooks = await query(
            """
            SELECT url, secret FROM webhooks
            WHERE domain_id = $1 AND enabled = TRUE AND $2 = ANY(events)
            """,
            domain_id,
            event,
        )

        if not webhooks:
            return

        payload = {
            "event": event,
            "domainId": str(domain_id),
            "timestamp": _iso_timestamp(),
            "data": data,
        }
        # `default=str` because `domain_id` and anything inside `data` may be
        # asyncpg UUID objects, which json.dumps cannot serialise on its own.
        body = json.dumps(payload, separators=(",", ":"), default=str)

        async with httpx.AsyncClient(timeout=DELIVERY_TIMEOUT_SECONDS) as client:

            async def deliver(webhook: dict) -> None:
                try:
                    headers = {
                        "Content-Type": "application/json",
                        "User-Agent": "Thravic-Webhook/1.0",
                    }

                    if webhook["secret"]:
                        signature = hmac.new(
                            str(webhook["secret"]).encode("utf-8"),
                            body.encode("utf-8"),
                            hashlib.sha256,
                        ).hexdigest()
                        headers["X-Thravic-Signature"] = signature

                    await client.post(webhook["url"], headers=headers, content=body)
                    log.info(f"[Webhook] Sent {event} to {webhook['url']}")
                except Exception as exc:
                    log.error(f"[Webhook] Failed to send to {webhook['url']}: {exc}")

            # Gather so tasks are not garbage collected mid-flight, matching
            # Express's `Promise.allSettled(promises)`.
            await asyncio.gather(*(deliver(webhook) for webhook in webhooks))

    except Exception as exc:
        log.error(f"[Webhook] Error triggering webhooks: {exc}")
