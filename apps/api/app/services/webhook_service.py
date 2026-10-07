"""Outbound webhook delivery — port of `services/webhookService.ts`.

Fire-and-forget: delivery is scheduled as a background task and never awaited by
the caller, so the originating request is not blocked (or failed) by a slow or
dead subscriber endpoint.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import json
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

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


async def destination_error(url: str) -> str | None:
    """Why `url` may not receive webhooks, or None when it may.

    The server makes the request, so without this a webhook could target
    loopback, the private network or the cloud metadata service (SSRF). Every
    address the host resolves to must be publicly routable. Checked when a webhook
    is saved and again before each delivery, since DNS can change in between;
    redirects are not followed, so a public host cannot bounce the request inward.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return "Webhook URL must be an http(s) URL"
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)
        )
    except OSError:
        return "Webhook URL host could not be resolved"
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
        if not address.is_global or address.is_multicast:
            return "Webhook URL must point to a public internet address"
    return None


async def trigger_webhooks(domain_id: str, event: str, data: Any) -> None:
    await trigger_for_events(domain_id, [(event, data)])


async def trigger_for_events(domain_id: str, events: list[tuple[str, Any]]) -> None:
    """Deliver each `(event type, data)` to the domain's subscribed webhooks.

    The webhooks are loaded once for the whole list, so a tracker batch costs one
    query rather than one per event.
    """
    try:
        webhooks = await query(
            "SELECT url, secret, events FROM webhooks WHERE domain_id = $1 AND enabled = TRUE",
            domain_id,
        )
        deliveries = [
            (webhook, event, data)
            for event, data in events
            for webhook in webhooks
            if event in (webhook["events"] or [])
        ]
        if not deliveries:
            return

        blocked: dict[str, str | None] = {}
        for webhook in webhooks:
            if webhook["url"] not in blocked:
                blocked[webhook["url"]] = await destination_error(webhook["url"])

        async with httpx.AsyncClient(
            timeout=DELIVERY_TIMEOUT_SECONDS, follow_redirects=False
        ) as client:

            async def deliver(webhook: dict, event: str, data: Any) -> None:
                if blocked[webhook["url"]]:
                    log.error(f"[Webhook] Refused {webhook['url']}: {blocked[webhook['url']]}")
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
            await asyncio.gather(*(deliver(*delivery) for delivery in deliveries))

    except Exception as exc:
        log.error(f"[Webhook] Error triggering webhooks: {exc}")
