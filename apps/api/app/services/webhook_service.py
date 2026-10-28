"""Outbound webhook delivery — port of `services/webhookService.ts`.

Fire-and-forget: delivery is scheduled as a background task and never awaited by
the caller, so the originating request is not blocked (or failed) by a slow or
dead subscriber endpoint.

`webhooks.kind` picks the body: 'custom' and 'zapier' get the signed JSON
payload; 'slack' (an incoming-webhook URL) gets a readable message instead, and
only for `alert` and `feedback` events.
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

KINDS = ("custom", "slack", "zapier")
SLACK_HOST = "hooks.slack.com"
# The events a Slack channel can follow; raw page views would flood it.
SLACK_EVENTS = ("alert", "feedback")

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


def _slack_escape(text: Any) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def slack_message(event: str, data: Any, domain: str) -> dict[str, str]:
    """The Slack message for an event: `{text}`, in Slack's mrkdwn."""
    data = data if isinstance(data, dict) else {}
    site = _slack_escape(domain)
    if event == "alert":
        lines = [
            f"*{_slack_escape(data.get('title') or 'Alert')}*",
            _slack_escape(data.get("message") or ""),
        ]
        links = []
        if data.get("link"):
            links.append(f"<{data['link']}|Open in Thravic>")
        links += [
            f"<{url}|Recording {n}>" for n, url in enumerate(data.get("recordings") or [], 1)
        ]
        if links:
            lines.append("  ·  ".join(links))
        return {"text": "\n".join(line for line in lines if line)}
    if event == "feedback":
        answer = data.get("data") if isinstance(data.get("data"), dict) else {}
        verdict = ":thumbsup: Yes" if answer.get("answer") == "yes" else ":thumbsdown: No"
        page = _slack_escape(data.get("url") or "")
        lines = [f"New feedback on {site}: *{verdict}*"]
        if answer.get("comment"):
            lines.append(f"> {_slack_escape(answer['comment'])}")
        if page:
            lines.append(f"Page: {page}")
        return {"text": "\n".join(lines)}
    return {"text": f"{_slack_escape(event)} on {site}"}


def build_request(
    webhook: dict, domain_id: str, event: str, data: Any
) -> tuple[dict[str, str], str]:
    """Headers and body for one delivery, in the webhook's kind's format."""
    payload: dict[str, Any] = {
        "event": event,
        "domainId": domain_id,
        "timestamp": _iso_timestamp(),
        "data": data,
    }
    slack = webhook.get("kind") == "slack"
    if slack:
        payload = slack_message(event, data, webhook.get("domain") or "")
    # `default=str` because `domain_id` and anything inside `data` may be
    # asyncpg UUID objects, which json.dumps cannot serialise on its own.
    body = json.dumps(payload, separators=(",", ":"), default=str)
    headers = {"Content-Type": "application/json", "User-Agent": "Thravic-Webhook/1.0"}
    if webhook.get("secret") and not slack:
        headers["X-Thravic-Signature"] = hmac.new(
            str(webhook["secret"]).encode("utf-8"), body.encode("utf-8"), hashlib.sha256
        ).hexdigest()
    return headers, body


def sample_alert(domain: str) -> dict[str, Any]:
    """What a test delivery carries: an alert like the hourly check sends."""
    return {
        "kind": "test",
        "title": f"Test from Thravic for {domain}",
        "message": "This connection works. Alerts and feedback will arrive here like this.",
        "link": "",
        "domain": domain,
        "recordings": [],
    }


async def send_test(webhook: dict) -> str | None:
    """Send one test alert to `webhook` and wait for it; why it failed, or None."""
    refusal = await destination_error(webhook["url"])
    if refusal:
        return refusal
    domain = webhook.get("domain") or ""
    headers, body = build_request(webhook, "", "alert", sample_alert(domain))
    try:
        async with httpx.AsyncClient(
            timeout=DELIVERY_TIMEOUT_SECONDS, follow_redirects=False
        ) as client:
            response = await client.post(webhook["url"], headers=headers, content=body)
    except Exception:
        return "The endpoint could not be reached"
    if response.status_code >= 400:
        return f"The endpoint answered {response.status_code}"
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
            """
            SELECT w.url, w.secret, w.events, w.kind, d.domain
            FROM webhooks w JOIN domains d ON d.id = w.domain_id
            WHERE w.domain_id = $1 AND w.enabled = TRUE
            """,
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
                headers, body = build_request(webhook, str(domain_id), event, data)
                try:
                    await client.post(webhook["url"], headers=headers, content=body)
                    log.info(f"[Webhook] Sent {event} to {webhook['url']}")
                except Exception as exc:
                    log.error(f"[Webhook] Failed to send to {webhook['url']}: {exc}")

            # Gather so tasks are not garbage collected mid-flight, matching
            # Express's `Promise.allSettled(promises)`.
            await asyncio.gather(*(deliver(*delivery) for delivery in deliveries))

    except Exception as exc:
        log.error(f"[Webhook] Error triggering webhooks: {exc}")
