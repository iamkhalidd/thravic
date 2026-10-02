"""Event collection — port of `routes/collect.ts`.

The hot path. Customer websites POST here with no auth token: the domain is
resolved from the `trackingId` in the URL, so this router is gated by the
tracking switch and the IP/referrer blocklist rather than by `require_auth`.

Two behaviours worth knowing:

* `POST /:trackingId` does **not** write to Postgres. It LPUSHes onto the
  `thravic:events_queue` Redis list and returns 202 immediately; a background
  worker drains it. The `/batch` variant writes synchronously instead.
* These routes are open to every origin (the tracking script runs on customer
  domains), so CORS is handled by `ThravicCORSMiddleware` rather than here.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC
from typing import Any

from fastapi import APIRouter, Depends, Request

from ..errors import PayloadError, SimpleError
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.blocklist_gate import blocklist_gate
from ..middleware.settings_gate import tracking_gate
from ..services import domain_service, event_service, recording_service, webhook_service
from ..services.geo_service import check_ip
from ..services.session_service import classify_source
from ..zod_lite import (
    enum_field,
    issue_invalid_type,
    issue_too_big,
    issue_too_small,
    js_type_of,
    number_field,
    string_field,
)

log = create_logger("Collect")

# trackingGate runs before openCors/blocklistGate in Express, so the order here
# mirrors that: tracking switch first, then the blocklist.
router = APIRouter(dependencies=[Depends(tracking_gate), Depends(blocklist_gate)])

EVENT_TYPES = ("pageview", "click", "scroll", "form", "custom", "session_end")
RECORDING_EVENT_TYPES = ("mousemove", "click", "scroll", "input", "resize", "pageview")

EVENTS_QUEUE_KEY = "thravic:events_queue"

MAX_EVENT_DATA_BYTES = 2048
MIN_BATCH_EVENTS = 1
MAX_BATCH_EVENTS = 50
MAX_RECORDING_EVENTS = 500

REALTIME_WINDOW_MINUTES = 5

INVALID_TRACKING_ID = "Invalid tracking ID"

# Strong references so background webhook deliveries are not garbage collected.
_background_tasks: set[asyncio.Task] = set()


def _fire_and_forget(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _domain_by_tracking_id(tracking_id: str) -> dict[str, Any]:
    domain = await domain_service.get_by_tracking_id(tracking_id)
    if not domain:
        raise SimpleError(INVALID_TRACKING_ID, 404)
    return domain


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    raw = forwarded or (request.client.host if request.client else "") or ""
    return raw.split(",")[0].strip()


def _event_issues(body: dict) -> list[dict]:
    """`eventSchema.parse` — issues in Zod's field-declaration order."""
    issues: list[dict] = []

    _, issue = enum_field(body, "type", EVENT_TYPES)
    if issue:
        issues.append(issue)

    _, issue = string_field(body, "url", is_url=True, url_message="Invalid URL")
    if issue:
        issues.append(issue)

    _, issue = string_field(body, "referrer", required=False)
    if issue:
        issues.append(issue)

    _, issue = string_field(
        body, "visitorId", min_length=1, min_message="Visitor ID is required"
    )
    if issue:
        issues.append(issue)

    _, issue = string_field(
        body, "sessionId", min_length=1, min_message="Session ID is required"
    )
    if issue:
        issues.append(issue)

    for name in ("utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent"):
        _, issue = string_field(body, name, required=False)
        if issue:
            issues.append(issue)

    for name in ("screenWidth", "screenHeight"):
        _, issue = number_field(body, name, required=False)
        if issue:
            issues.append(issue)

    _, issue = string_field(body, "language", required=False)
    if issue:
        issues.append(issue)

    data = body.get("data")
    if data is not None and not isinstance(data, dict):
        issues.append(issue_invalid_type("data", "object", js_type_of(data)))

    return issues


def _batch_issues(body: dict) -> list[dict]:
    """`batchSchema.parse` — bounds first, then every issue from every element.

    Verified against the real validator (zod 3.25.76). Two details matter:

    * Zod applies the `.min()`/`.max()` checks **before** walking the elements,
      so a 51-element batch reports `too_big` *and* the element issues.
    * Zod's `ZodObject` collects every bad field rather than stopping at the
      first, and `ZodArray` keeps iterating after a non-aborted child, so
      `[valid, {type:'pageview'}]` yields three issues for index 1 (url,
      visitorId, sessionId), not one.
    """
    events = body.get("events")

    if events is None:
        return [issue_invalid_type("events", "array", "undefined")]
    if not isinstance(events, list):
        return [issue_invalid_type("events", "array", js_type_of(events))]

    issues: list[dict] = []

    # Bounds run first, independently of the element walk.
    if len(events) < MIN_BATCH_EVENTS:
        issues.append(
            issue_too_small(
                "events", MIN_BATCH_EVENTS, "array", "At least one event required"
            )
        )
    elif len(events) > MAX_BATCH_EVENTS:
        issues.append(
            issue_too_big(
                "events",
                MAX_BATCH_EVENTS,
                "array",
                "Maximum 50 events per batch",
            )
        )

    for index, event in enumerate(events):
        if not isinstance(event, dict):
            issues.append(
                {
                    **issue_invalid_type("events", "object", js_type_of(event)),
                    "path": ["events", index],
                }
            )
            continue

        for issue in _event_issues(event):
            issues.append(
                {**issue, "path": ["events", index, *issue.get("path", [])]}
            )

    return issues


async def _body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {}
    return body if isinstance(body, dict) else {}


@router.post("/{trackingId}")
async def collect_event(trackingId: str, request: Request):
    try:
        domain = await _domain_by_tracking_id(trackingId)

        body = await _body(request)
        issues = _event_issues(body)
        if issues:
            raise PayloadError({"error": "Invalid event data", "details": issues}, 400)

        user_agent = request.headers.get("user-agent") or ""
        location = check_ip(_client_ip(request))

        source_type = classify_source(
            body.get("referrer") or None,
            body.get("utmSource") or None,
            body.get("utmMedium") or None,
        )

        # Guard against oversized payloads consuming database storage
        data = body.get("data")
        if data is not None and len(json.dumps(data, separators=(",", ":"))) > MAX_EVENT_DATA_BYTES:
            raise SimpleError(
                "Payload too large - custom event data limited to 2KB", 413
            )

        queued_event = {
            "domainId": str(domain["id"]),
            "sessionId": body.get("sessionId"),
            "visitorId": body.get("visitorId"),
            "type": body["type"],
            "url": body["url"],
            "referrer": body.get("referrer") or None,
            "utmSource": body.get("utmSource") or None,
            "utmMedium": body.get("utmMedium") or None,
            "utmCampaign": body.get("utmCampaign") or None,
            "utmTerm": body.get("utmTerm") or None,
            "utmContent": body.get("utmContent") or None,
            "data": data or {},
            "userAgent": user_agent,
            "screenWidth": body.get("screenWidth") or None,
            "screenHeight": body.get("screenHeight") or None,
            "language": body.get("language") or None,
            "country": (location or {}).get("country"),
            "region": (location or {}).get("region"),
            "city": (location or {}).get("city"),
            "sourceType": source_type,
            "receivedAt": _now_iso(),
        }

        from ..redis_client import get_client

        client = get_client()
        if client is not None:
            await client.lpush(EVENTS_QUEUE_KEY, json.dumps(queued_event))

        # Fire and forget — the response must not wait on webhook delivery
        _fire_and_forget(
            webhook_service.trigger_webhooks(
                domain["id"],
                body["type"],
                {**body, "location": location, "sourceType": source_type},
            )
        )

        return jsjson({"success": True}, status_code=202)
    except (PayloadError, SimpleError):
        raise
    except Exception as exc:
        log.error(f"Collect error: {exc}")
        raise SimpleError("Failed to process event", 500) from None


@router.post("/{trackingId}/batch")
async def collect_batch(trackingId: str, request: Request):
    try:
        domain = await _domain_by_tracking_id(trackingId)

        body = await _body(request)
        issues = _batch_issues(body)
        if issues:
            raise PayloadError({"error": "Invalid batch data", "details": issues}, 400)

        events = body["events"]
        user_agent = request.headers.get("user-agent") or ""

        inserts: list[dict[str, Any]] = []
        for event in events:
            source_type = classify_source(
                event.get("referrer") or None,
                event.get("utmSource") or None,
                event.get("utmMedium") or None,
            )

            await session_service_upsert(domain["id"], event, user_agent, source_type)

            inserts.append(
                {
                    "domainId": domain["id"],
                    "sessionId": event.get("sessionId"),
                    "visitorId": event.get("visitorId"),
                    "type": event["type"],
                    "url": event["url"],
                    "referrer": event.get("referrer") or None,
                    "utmSource": event.get("utmSource") or None,
                    "utmMedium": event.get("utmMedium") or None,
                    "utmCampaign": event.get("utmCampaign") or None,
                    "data": event.get("data") or {},
                }
            )

        count = await event_service.batch_insert(inserts)
        return jsjson({"success": True, "processed": count}, status_code=202)
    except (PayloadError, SimpleError):
        raise
    except Exception as exc:
        log.error(f"Batch collect error: {exc}")
        raise SimpleError("Failed to process events", 500) from None


async def session_service_upsert(
    domain_id: Any, event: dict, user_agent: str, source_type: str
) -> None:
    """`sessionService.upsert` as called from the batch collector."""
    from ..services import session_service

    await session_service.upsert(
        {
            "sessionId": event["sessionId"],
            "domainId": domain_id,
            "visitorId": event.get("visitorId"),
            # NOTE: source prefers utmSource, then referrer
            "source": event.get("utmSource") or event.get("referrer") or None,
            "sourceType": source_type,
            "referrer": event.get("referrer") or None,
            "utmSource": event.get("utmSource") or None,
            "utmMedium": event.get("utmMedium") or None,
            "utmCampaign": event.get("utmCampaign") or None,
            "utmTerm": event.get("utmTerm") or None,
            "utmContent": event.get("utmContent") or None,
            "userAgent": user_agent,
            "screenWidth": event.get("screenWidth") or None,
            "screenHeight": event.get("screenHeight") or None,
            "language": event.get("language") or None,
        }
    )


@router.get("/realtime/{trackingId}")
async def collect_realtime(trackingId: str):
    try:
        domain = await _domain_by_tracking_id(trackingId)

        active_visitors = await event_service.count_realtime_visitors(
            domain["id"], REALTIME_WINDOW_MINUTES
        )
        return jsjson({"activeVisitors": active_visitors, "trackingId": trackingId})
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Realtime error: {exc}")
        raise SimpleError("Failed to get realtime data", 500) from None


def _recording_start_issues(body: dict) -> list[dict]:
    """`startRecordingSchema.parse`."""
    issues: list[dict] = []

    _, issue = string_field(body, "sessionId", required=False)
    if issue:
        issues.append(issue)

    _, issue = string_field(body, "url", is_url=True, url_message="Invalid URL")
    if issue:
        issues.append(issue)

    return issues


def _recording_events_issues(body: dict) -> list[dict]:
    """`appendEventsSchema.parse` — bounds first, then every element's issues.

    Same zod semantics as `_batch_issues`: the `.min()`/`.max()` array checks run
    before the element walk, and every issue from every element is collected.
    """
    events = body.get("events")

    if events is None:
        return [issue_invalid_type("events", "array", "undefined")]
    if not isinstance(events, list):
        return [issue_invalid_type("events", "array", js_type_of(events))]

    issues: list[dict] = []

    if len(events) < MIN_BATCH_EVENTS:
        issues.append(
            issue_too_small(
                "events", MIN_BATCH_EVENTS, "array", "At least one event required"
            )
        )
    elif len(events) > MAX_RECORDING_EVENTS:
        issues.append(
            issue_too_big(
                "events",
                MAX_RECORDING_EVENTS,
                "array",
                "Maximum 500 events per batch",
            )
        )

    for index, event in enumerate(events):
        if not isinstance(event, dict):
            issues.append(
                {
                    **issue_invalid_type("events", "object", js_type_of(event)),
                    "path": ["events", index],
                }
            )
            continue

        _, issue = enum_field(event, "type", RECORDING_EVENT_TYPES)
        if issue:
            issues.append({**issue, "path": ["events", index, "type"]})

        _, issue = number_field(event, "timestamp")
        if issue:
            issues.append({**issue, "path": ["events", index, "timestamp"]})

        data = event.get("data")
        if data is None or not isinstance(data, dict):
            issues.append(
                {
                    **issue_invalid_type("data", "object", js_type_of(data)),
                    "path": ["events", index, "data"],
                }
            )

    return issues


@router.post("/{trackingId}/recording/start")
async def recording_start(trackingId: str, request: Request):
    try:
        domain = await _domain_by_tracking_id(trackingId)

        body = await _body(request)
        issues = _recording_start_issues(body)
        if issues:
            raise PayloadError(
                {"error": "Invalid recording data", "details": issues}, 400
            )

        recording = await recording_service.create(
            domain["id"], body.get("sessionId") or None, body["url"]
        )
        if not recording:
            raise SimpleError("Failed to start recording", 500)

        return jsjson(
            {
                "id": recording["id"],
                "startedAt": recording["started_at"],
                "status": "recording",
            },
            status_code=201,
        )
    except (PayloadError, SimpleError):
        raise
    except Exception as exc:
        log.error(f"Collect recording start error: {exc}")
        raise SimpleError("Failed to start recording", 500) from None


@router.post("/{trackingId}/recording/{recordingId}/events")
async def recording_events(trackingId: str, recordingId: str, request: Request):
    try:
        domain = await _domain_by_tracking_id(trackingId)

        body = await _body(request)
        issues = _recording_events_issues(body)
        if issues:
            raise PayloadError(
                {"error": "Invalid recording events", "details": issues}, 400
            )

        recording = await recording_service.get_by_id(recordingId)
        if not recording or not _same_id(recording["domain_id"], domain["id"]):
            raise SimpleError("Recording not found", 404)

        await recording_service.append_events(recording["id"], body["events"])
        return jsjson(
            {"success": True, "appended": len(body["events"])}, status_code=202
        )
    except (PayloadError, SimpleError):
        raise
    except Exception as exc:
        log.error(f"Collect recording events error: {exc}")
        raise SimpleError("Failed to append recording events", 500) from None


@router.post("/{trackingId}/recording/{recordingId}/end")
async def recording_end(trackingId: str, recordingId: str):
    try:
        domain = await _domain_by_tracking_id(trackingId)

        recording = await recording_service.end_recording(recordingId)
        if not recording or not _same_id(recording["domain_id"], domain["id"]):
            raise SimpleError("Recording not found", 404)

        return jsjson(
            {
                "id": recording["id"],
                "duration": recording["duration"],
                "eventsCount": recording["events_count"],
                "status": "completed",
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Collect recording end error: {exc}")
        raise SimpleError("Failed to end recording", 500) from None


def _same_id(left: Any, right: Any) -> bool:
    """Compare two UUID values regardless of whether they arrived as objects/strings."""
    return str(left) == str(right)


def _now_iso() -> str:
    from datetime import datetime

    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
