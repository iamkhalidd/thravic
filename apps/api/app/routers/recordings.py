"""Recording routes — port of `routes/recordings.ts`.

`POST /:domainId/start` deliberately **does not validate** its body:
`startRecordingSchema` is imported but never used, so a missing `url` reaches the
INSERT as NULL and surfaces as a 500. Preserved as-is.

The Zod failure on the events route returns a hardcoded `Invalid event data`
rather than the underlying message.
"""

from __future__ import annotations

import math

from fastapi import APIRouter, Depends, Request

from ..errors import SimpleError
from ..js_compat import js_parse_int
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
from ..services import domain_service, recording_service
from ..zod_lite import number_field

log = create_logger("Recordings")

router = APIRouter()

DEFAULT_LIMIT = 20
MAX_LIMIT = 50
MAX_EVENTS_PER_BATCH = 500

EVENT_TYPES = ("mousemove", "click", "scroll", "input", "resize", "pageview")

FAILED_START = "Failed to start recording"
FAILED_APPEND = "Failed to append events"
FAILED_END = "Failed to end recording"
FAILED_LIST = "Failed to list recordings"
FAILED_GET = "Failed to get recording"
FAILED_DELETE = "Failed to delete recording"


async def _require_owned_domain(domain_id: str, user_id: str) -> dict:
    domain = await domain_service.get_by_id(domain_id)
    if not domain_service.is_owner(domain, user_id):
        raise SimpleError("Domain not found", 404)
    return domain


def _parse_positive_int(raw: str | None, default: int) -> int:
    """`parseInt(x) || default` — 0 and NaN both fall back."""
    if raw is None:
        return default
    parsed = js_parse_int(raw)
    return parsed if parsed else default


def _events_are_valid(raw) -> bool:
    """`appendEventsSchema.safeParse` — the caller only needs a yes/no."""
    if not isinstance(raw, list):
        return False
    if len(raw) < 1 or len(raw) > MAX_EVENTS_PER_BATCH:
        return False

    for event in raw:
        if not isinstance(event, dict):
            return False
        event_type = event.get("type")
        if not isinstance(event_type, str) or event_type not in EVENT_TYPES:
            return False
        _, issue = number_field(event, "timestamp")
        if issue:
            return False
        data = event.get("data")
        if data is None or not isinstance(data, dict):
            return False
    return True


@router.post("/{domainId}/start")
async def start_recording(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("recordings")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        recording = await recording_service.create(
            domain["id"], body.get("sessionId") or None, body.get("url")
        )
        if not recording:
            raise SimpleError(FAILED_START, 500)

        return jsjson(
            {
                "id": recording["id"],
                "startedAt": recording["started_at"],
                "status": "recording",
            },
            status_code=201,
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Start recording error: {exc}")
        raise SimpleError(FAILED_START, 500) from None


@router.post("/{domainId}/{recordingId}/events")
async def append_events(
    domainId: str,
    recordingId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("recordings")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        recording = await recording_service.get_by_id(recordingId)
        if not recording or recording["domain_id"] != domain["id"]:
            raise SimpleError("Recording not found", 404)

        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        events = body.get("events")
        if not _events_are_valid(events):
            raise SimpleError("Invalid event data", 400)

        await recording_service.append_events(recording["id"], events)
        return jsjson({"success": True, "eventsAdded": len(events)})
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Append events error: {exc}")
        raise SimpleError(FAILED_APPEND, 500) from None


@router.post("/{domainId}/{recordingId}/end")
async def end_recording(
    domainId: str,
    recordingId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("recordings")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        recording = await recording_service.end_recording(recordingId)
        if not recording or recording["domain_id"] != domain["id"]:
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
        log.error(f"End recording error: {exc}")
        raise SimpleError(FAILED_END, 500) from None


@router.get("/{domainId}")
async def list_recordings(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("recordings")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        page = _parse_positive_int(request.query_params.get("page"), 1)
        limit = min(
            _parse_positive_int(request.query_params.get("limit"), DEFAULT_LIMIT), MAX_LIMIT
        )
        offset = (page - 1) * limit

        recordings = await recording_service.list_by_domain(domain["id"], limit, offset)
        total = await recording_service.count_by_domain(domain["id"])

        return jsjson(
            {
                "recordings": [
                    {
                        "id": r["id"],
                        "url": r["url"],
                        "duration": r["duration"],
                        "eventsCount": r["events_count"],
                        "startedAt": r["started_at"],
                        "endedAt": r["ended_at"],
                    }
                    for r in recordings
                ],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "totalPages": math.ceil(total / limit) if limit else 0,
                },
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"List recordings error: {exc}")
        raise SimpleError(FAILED_LIST, 500) from None


@router.get("/{domainId}/{recordingId}")
async def get_recording(
    domainId: str,
    recordingId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("recordings")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        recording = await recording_service.get_by_id(recordingId)
        if not recording or recording["domain_id"] != domain["id"]:
            raise SimpleError("Recording not found", 404)

        recording_data = recording.get("recording_data") or {}

        return jsjson(
            {
                "id": recording["id"],
                "url": recording["url"],
                "duration": recording["duration"],
                "eventsCount": recording["events_count"],
                "events": recording_data.get("events") or [],
                "startedAt": recording["started_at"],
                "endedAt": recording["ended_at"],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Get recording error: {exc}")
        raise SimpleError(FAILED_GET, 500) from None


@router.delete("/{domainId}/{recordingId}")
async def delete_recording(
    domainId: str,
    recordingId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("recordings")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        recording = await recording_service.get_by_id(recordingId)
        if not recording or recording["domain_id"] != domain["id"]:
            raise SimpleError("Recording not found", 404)

        await recording_service.remove(recordingId)
        return jsjson({"message": "Recording deleted successfully"})
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Delete recording error: {exc}")
        raise SimpleError(FAILED_DELETE, 500) from None
