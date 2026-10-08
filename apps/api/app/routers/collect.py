"""Event collection — port of `routes/collect.ts`.

The hot path. Customer websites POST here with no auth token: the domain is
resolved from the `trackingId` in the URL, so this router is gated by the
tracking switch and the IP/referrer blocklist rather than by `require_auth`.

Both write paths persist synchronously. There is no Redis in the ingest path, so
`POST /:trackingId` upserts the session and inserts the event before it answers,
and `/batch` does the same for every event — a storage failure surfaces as a 500
rather than being quietly dropped into a queue.

These routes are open to every origin (the tracking script runs on customer
domains), so CORS is handled by `ThravicCORSMiddleware` rather than here.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, Request

from ..db import retry_transient
from ..errors import PayloadError, SimpleError
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.blocklist_gate import blocklist_gate
from ..middleware.settings_gate import tracking_gate
from ..services import (
    domain_service,
    event_service,
    plan_service,
    recording_service,
    webhook_service,
)
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

MAX_EVENT_DATA_BYTES = 2048
MIN_BATCH_EVENTS = 1
MAX_BATCH_EVENTS = 50
MAX_RECORDING_EVENTS = 500

# rrweb uploads: a page snapshot alone can be a few hundred KB.
MAX_RRWEB_BATCH_BYTES = 5 * 1024 * 1024
MAX_RRWEB_BATCH_EVENTS = 5000
# `dropped` value on a 202 when the recording has reached its size cap.
RECORDING_SIZE_LIMIT = "recording_size_limit"

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

    # Client-generated idempotency key; optional, so older snippets keep working.
    _, issue = string_field(body, "eventId", required=False)
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


# `dropped` value on a 202 when the owner's plan has no events left this month.
EVENT_LIMIT_REACHED = "monthly_event_limit"
# ...and when the site is over the owner's website limit (a lapsed paid plan).
SITE_PAUSED = "site_paused"


@router.post("/{trackingId}")
async def collect_event(trackingId: str, request: Request):
    try:
        domain = await _domain_by_tracking_id(trackingId)

        body = await _body(request)
        issues = _event_issues(body)
        if issues:
            raise PayloadError({"error": "Invalid event data", "details": issues}, 400)

        # Switched off for this domain: acknowledged, so the tracker drops it.
        if not domain_service.collects(domain, body["type"]):
            return jsjson({"success": True}, status_code=202)

        # Over the plan's monthly events: acknowledged and dropped the same way,
        # since a rejection would make the tracker retry the event forever.
        if await plan_service.over_event_limit(str(domain["user_id"])):
            return jsjson({"success": True, "dropped": EVENT_LIMIT_REACHED}, status_code=202)
        if await plan_service.site_paused(str(domain["user_id"]), str(domain["id"])):
            return jsjson({"success": True, "dropped": SITE_PAUSED}, status_code=202)

        user_agent = request.headers.get("user-agent") or ""
        location = check_ip(_client_ip(request))

        source_type = classify_source(
            body.get("referrer") or None,
            body.get("utmSource") or None,
            body.get("utmMedium") or None,
            domain.get("domain"),
        )

        # Guard against oversized payloads consuming database storage
        data = body.get("data")
        if data is not None and len(json.dumps(data, separators=(",", ":"))) > MAX_EVENT_DATA_BYTES:
            raise SimpleError(
                "Payload too large - custom event data limited to 2KB", 413
            )

        # The session is upserted first so the event's foreign keys resolve; the
        # event row is written in the same request. `utmTerm`/`utmContent` live on
        # the session only, matching the `/batch` route. Each write is retried on
        # its own so a blip cannot cost the event, and so a retry can never repeat
        # a side effect that already succeeded.
        await retry_transient(
            lambda: session_service_upsert(
                domain["id"], body, user_agent, source_type, location
            ),
            description="Session upsert",
        )

        await retry_transient(
            lambda: event_service.batch_insert(
                [
                    {
                        "domainId": domain["id"],
                        "sessionId": body.get("sessionId"),
                        "visitorId": body.get("visitorId"),
                        "eventId": body.get("eventId") or None,
                        "type": body["type"],
                        "url": body["url"],
                        "referrer": body.get("referrer") or None,
                        "utmSource": body.get("utmSource") or None,
                        "utmMedium": body.get("utmMedium") or None,
                        "utmCampaign": body.get("utmCampaign") or None,
                        "data": data or {},
                    }
                ]
            ),
            description="Event insert",
        )

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

        if await plan_service.over_event_limit(str(domain["user_id"])):
            return jsjson(
                {"success": True, "processed": 0, "dropped": EVENT_LIMIT_REACHED},
                status_code=202,
            )
        if await plan_service.site_paused(str(domain["user_id"]), str(domain["id"])):
            return jsjson(
                {"success": True, "processed": 0, "dropped": SITE_PAUSED}, status_code=202
            )

        # Event types switched off for this domain are acknowledged but not stored.
        events = [e for e in body["events"] if domain_service.collects(domain, e["type"])]
        user_agent = request.headers.get("user-agent") or ""

        inserts: list[dict[str, Any]] = []
        for event in events:
            source_type = classify_source(
                event.get("referrer") or None,
                event.get("utmSource") or None,
                event.get("utmMedium") or None,
                domain.get("domain"),
            )

            await retry_transient(
                lambda event=event, source_type=source_type: session_service_upsert(
                    domain["id"], event, user_agent, source_type
                ),
                description="Session upsert",
            )

            inserts.append(
                {
                    "domainId": domain["id"],
                    "sessionId": event.get("sessionId"),
                    "visitorId": event.get("visitorId"),
                    "eventId": event.get("eventId") or None,
                    "type": event["type"],
                    "url": event["url"],
                    "referrer": event.get("referrer") or None,
                    "utmSource": event.get("utmSource") or None,
                    "utmMedium": event.get("utmMedium") or None,
                    "utmCampaign": event.get("utmCampaign") or None,
                    "data": event.get("data") or {},
                }
            )

        # A retried attempt re-collects from scratch, so only the final one counts.
        stored: list[dict[str, Any]] = []

        async def insert() -> int:
            stored.clear()
            return await event_service.batch_insert(inserts, stored)

        count = await retry_transient(insert, description="Event insert")

        # Only newly stored events: the tracker re-sends a batch until it is
        # acknowledged, and a replay must not notify subscribers twice.
        if stored:
            # Subscribers get the event as the tracker sent it, as on the
            # single-event route; `inserts[i]` was built from `events[i]`.
            raw_event = {id(row): event for row, event in zip(inserts, events, strict=True)}
            _fire_and_forget(
                webhook_service.trigger_for_events(
                    domain["id"],
                    [(row["type"], raw_event[id(row)]) for row in stored],
                )
            )
        return jsjson({"success": True, "processed": count}, status_code=202)
    except (PayloadError, SimpleError):
        raise
    except Exception as exc:
        log.error(f"Batch collect error: {exc}")
        raise SimpleError("Failed to process events", 500) from None


async def session_service_upsert(
    domain_id: Any,
    event: dict,
    user_agent: str,
    source_type: str,
    location: dict | None = None,
) -> None:
    """`sessionService.upsert` as called from the collectors.

    `location` is the geo lookup from the request IP; the single-event route has
    it, the batch route does not.
    """
    from ..services import session_service

    location = location or {}

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
            "country": location.get("country"),
            "region": location.get("region"),
            "city": location.get("city"),
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


async def _records(domain: dict[str, Any]) -> bool:
    """Recording needs the domain's setting on and the owner's plan to include it."""
    if not domain_service.effective_settings(domain)["sessionRecording"]:
        return False
    plan = await plan_service.owner_plan(domain["id"])
    return "recordings" in plan.features


@router.get("/{trackingId}/config")
async def tracker_config(trackingId: str):
    """What the tracker should collect, from the domain's dashboard settings.

    Public, like the rest of this router: it reveals only on/off switches. The
    tracker applies it over its defaults; anything the site sets in
    `window.__TF_CONFIG__` still wins, and the collector enforces the switches
    whatever the client does.
    """
    try:
        domain = await _domain_by_tracking_id(trackingId)
        settings = domain_service.effective_settings(domain)
        return jsjson(
            {
                "trackClicks": settings["trackClicks"],
                "trackScrolls": settings["trackScrolls"],
                "trackForms": settings["trackForms"],
                "trackRecordings": await _records(domain),
                "recordingConsentPrompt": settings["recordingConsentPrompt"],
                "recordingSampleRate": settings["recordingSampleRate"],
            },
            # Short, so a dashboard change reaches visitors within a minute.
            headers={"Cache-Control": "public, max-age=60"},
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Tracker config error: {exc}")
        raise SimpleError("Failed to load tracker config", 500) from None


@router.post("/{trackingId}/recording/start")
async def recording_start(trackingId: str, request: Request):
    try:
        domain = await _domain_by_tracking_id(trackingId)
        if not await _records(domain):
            raise SimpleError("Session recording is not enabled for this site", 403)
        if await plan_service.over_event_limit(str(domain["user_id"])):
            raise SimpleError("This site has reached its monthly event limit", 403)
        if await plan_service.site_paused(str(domain["user_id"]), str(domain["id"])):
            raise SimpleError("This site is paused: the account's plan covers fewer sites", 403)
        limit = domain_service.effective_settings(domain)["recordingDailyLimit"]
        if await recording_service.count_started_today(domain["id"]) >= limit:
            raise SimpleError("This site has reached its daily recording limit", 429)
        plan = await plan_service.owner_plan(domain["id"])
        if plan.recordings_per_day is not None and (
            await recording_service.count_started_today_for_owner(str(domain["user_id"]))
            >= plan.recordings_per_day
        ):
            raise SimpleError("This account has reached its plan's daily recording limit", 429)

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


async def _capped_body(request: Request, limit: int) -> dict:
    """The JSON body, refusing anything over `limit` bytes before parsing it.

    Parsed whatever the content type: unload beacons arrive as text/plain.
    """
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise SimpleError("Recording upload too large", 413)
    raw = bytearray()
    async for chunk in request.stream():
        raw += chunk
        if len(raw) > limit:
            raise SimpleError("Recording upload too large", 413)
    try:
        body = json.loads(raw)
    except ValueError:
        body = {}
    return body if isinstance(body, dict) else {}


def _rrweb_events_issues(body: dict) -> list[dict]:
    """An rrweb upload: 1..MAX_RRWEB_BATCH_EVENTS objects, each with a numeric
    `type` and `timestamp`. The rest of an event is rrweb's and stored as sent."""
    events = body.get("events")
    if not isinstance(events, list):
        return [issue_invalid_type("events", "array", js_type_of(events))]
    if not events:
        return [issue_too_small("events", 1, "array", "At least one event required")]
    if len(events) > MAX_RRWEB_BATCH_EVENTS:
        return [
            issue_too_big(
                "events",
                MAX_RRWEB_BATCH_EVENTS,
                "array",
                f"Maximum {MAX_RRWEB_BATCH_EVENTS} events per batch",
            )
        ]

    issues: list[dict] = []
    for index, event in enumerate(events):
        if not isinstance(event, dict):
            issues.append(
                {
                    **issue_invalid_type("events", "object", js_type_of(event)),
                    "path": ["events", index],
                }
            )
            continue
        for key in ("type", "timestamp"):
            _, issue = number_field(event, key)
            if issue:
                issues.append({**issue, "path": ["events", index, key]})
    return issues


@router.post("/{trackingId}/recording/{recordingId}/events")
async def recording_events(trackingId: str, recordingId: str, request: Request):
    try:
        domain = await _domain_by_tracking_id(trackingId)

        body = await _capped_body(request, MAX_RRWEB_BATCH_BYTES)
        if body.get("format") == "rrweb":
            issues = _rrweb_events_issues(body)
            if issues:
                raise PayloadError(
                    {"error": "Invalid recording events", "details": issues}, 400
                )
            recording = await recording_service.get_by_id_light(recordingId)
            if not recording or not _same_id(recording["domain_id"], domain["id"]):
                raise SimpleError("Recording not found", 404)

            stored = await recording_service.append_rrweb_events(
                recording["id"], body["events"]
            )
            if not stored:
                return jsjson(
                    {"success": True, "dropped": RECORDING_SIZE_LIMIT}, status_code=202
                )
            return jsjson(
                {"success": True, "appended": len(body["events"])}, status_code=202
            )

        issues = _recording_events_issues(body)
        if issues:
            raise PayloadError(
                {"error": "Invalid recording events", "details": issues}, 400
            )

        recording = await recording_service.get_by_id_light(recordingId)
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
