"""Funnel routes — port of `routes/funnels.ts`.

The feature gate (`funnels` is a Pro feature) runs before the domain lookup, and
every handler additionally requires direct domain **ownership** — team members are
excluded here, unlike `domainService.hasAccess`.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, Query, Request

from ..date_range import date_range
from ..errors import SimpleError
from ..js_compat import js_round, url_path
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
from ..services import domain_service, event_service, funnel_service
from ..zod_lite import (
    first_message,
    issue_invalid_enum,
    issue_invalid_type,
    issue_too_small,
    js_type_of,
    string_field,
)

log = create_logger("Funnels")

router = APIRouter()

METRICS_LOOKBACK_DAYS = 30
STEP_TYPES = ("pageview", "click", "custom")
MATCH_TYPES = ("exact", "contains", "regex")
# Which part of an event a step can match, per step type (the builder's "Field").
# A step saved without one matches the URL or its path (page steps) or the event
# name (custom event steps).
MATCH_FIELDS = {
    "pageview": ("url", "path", "referrer"),
    "click": ("url", "path", "elementId", "elementClass"),
    "custom": ("eventName", "url", "path"),
}

FAILED_LIST = "Failed to list funnels"
FAILED_CREATE = "Failed to create funnel"
FAILED_GET = "Failed to get funnel"
FAILED_UPDATE = "Failed to update funnel"
FAILED_DELETE = "Failed to delete funnel"


async def _require_owned_domain(domain_id: str, user_id: str) -> dict[str, Any]:
    domain = await domain_service.get_by_id(domain_id)
    if not domain_service.is_owner(domain, user_id):
        raise SimpleError("Domain not found", 404)
    return domain


def _validate_steps(raw: Any, *, optional: bool) -> tuple[list[dict] | None, dict | None]:
    """Validate a `steps` array and return (steps, first issue).

    Element issues are collected before the array-level `min`/`max` checks, which
    matches how Zod reports a short-but-also-invalid array.
    """
    if raw is None:
        if optional:
            return None, None
        return None, issue_invalid_type("steps", "array", "undefined")

    if not isinstance(raw, list):
        return None, issue_invalid_type("steps", "array", js_type_of(raw))

    validated: list[dict] = []
    for index, step in enumerate(raw):
        if not isinstance(step, dict):
            return None, issue_invalid_type("steps", "object", js_type_of(step))

        name, issue = string_field(
            step, "name", min_length=1, min_message="Step name is required"
        )
        if issue:
            return None, {**issue, "path": ["steps", index, "name"]}

        step_type, issue = _nested_enum(step, "type", STEP_TYPES)
        if issue:
            return None, {**issue, "path": ["steps", index, "type"]}

        match_type, issue = _nested_enum(
            step, "matchType", MATCH_TYPES, default="contains"
        )
        if issue:
            return None, {**issue, "path": ["steps", index, "matchType"]}

        match_value, issue = string_field(
            step, "matchValue", min_length=1, min_message="Match value is required"
        )
        if issue:
            return None, {**issue, "path": ["steps", index, "matchValue"]}

        match_field = None
        if step.get("matchField") is not None:
            match_field, issue = _nested_enum(step, "matchField", MATCH_FIELDS[step_type])
            if issue:
                return None, {**issue, "path": ["steps", index, "matchField"]}

        validated.append(
            {
                "name": name,
                "type": step_type,
                "matchType": match_type,
                "matchValue": match_value,
                "matchField": match_field,
            }
        )

    if len(validated) < 2:
        return None, issue_too_small(
            "steps", 2, "array", "A funnel needs at least 2 steps"
        )
    if len(validated) > 10:
        return None, {
            "code": "too_big",
            "maximum": 10,
            "type": "array",
            "inclusive": True,
            "exact": False,
            "message": "Maximum 10 steps per funnel",
            "path": ["steps"],
        }

    return validated, None


def _nested_enum(
    source: dict, key: str, options: tuple[str, ...], default: str = ""
) -> tuple[str | None, dict | None]:
    raw = source.get(key)
    if raw is None:
        if default:
            return default, None
        return None, issue_invalid_type(key, "string", "undefined")
    if not isinstance(raw, str):
        return None, issue_invalid_type(key, "string", js_type_of(raw))
    if raw not in options:
        return None, issue_invalid_enum(key, options, raw)
    return raw, None


def _validate_create(body: dict) -> tuple[dict | None, str | None]:
    name, issue = string_field(
        body, "name", min_length=1, min_message="Funnel name is required"
    )
    if issue:
        return None, first_message([issue])

    description, issue = string_field(body, "description", required=False, default="")
    if issue:
        return None, first_message([issue])

    steps, issue = _validate_steps(body.get("steps"), optional=False)
    if issue:
        return None, first_message([issue])

    return {"name": name, "description": description, "steps": steps}, None


def _validate_update(body: dict) -> tuple[dict | None, str | None]:
    name, issue = string_field(body, "name", required=False, min_length=1)
    if issue:
        return None, first_message([issue])

    description, issue = string_field(body, "description", required=False)
    if issue:
        return None, first_message([issue])

    steps, issue = _validate_steps(body.get("steps"), optional=True)
    if issue:
        return None, first_message([issue])

    return {"name": name, "description": description, "steps": steps}, None


def _step_payload(step: dict) -> dict:
    return {
        "id": step["id"],
        "name": step["name"],
        "type": step["type"],
        "matchType": step["match_type"],
        "matchValue": step["match_value"],
        "matchField": step.get("match_field"),
        "order": step["step_order"],
    }


def _step_candidates(field: str | None, event: dict) -> list[str]:
    """The values of `event` a step's match is tried against.

    With no field (steps saved before the builder's choice was stored), page
    steps match the full URL or its path — so "exact" `/pricing` matches
    `https://site.com/pricing` — and custom event steps match the event name.
    """
    data = event.get("data")
    data = data if isinstance(data, dict) else {}
    url = event.get("url") or ""

    if field is None:
        if event["type"] == "custom":
            return [str(data.get("event") or "")]
        return [url, url_path(url)]
    if field == "url":
        return [url]
    if field == "path":
        return [url_path(url)]
    if field == "referrer":
        return [event.get("referrer") or ""]
    if field == "elementId":
        return [str(data.get("id") or "")]
    if field == "elementClass":
        # The whole class attribute, or any one class ("exact" `btn-primary`
        # matches `btn btn-primary`).
        classes = str(data.get("className") or "")
        return [classes, *classes.split()]
    if field == "eventName":
        return [str(data.get("event") or "")]
    return []


def _matches_step(step: dict, event: dict) -> bool:
    """Whether `event` satisfies `step`, on the step's field (see `_step_candidates`)."""
    if step["type"] != event["type"]:
        return False

    candidates = _step_candidates(step.get("match_field"), event)

    expected = step["match_value"]
    match_type = step["match_type"]
    for value in candidates:
        if match_type == "exact" and value == expected:
            return True
        if match_type == "contains" and expected in value:
            return True
        if match_type == "regex":
            try:
                if re.search(expected, value) is not None:
                    return True
            except re.error:
                return False
    return False


def _funnel_progress(steps: list[dict], events: list[dict]) -> list[int]:
    """Visitors reaching each step, in order.

    Each visitor's events are walked oldest first; a step counts only after the
    previous one, so step 2 is never credited to someone who skipped step 1.
    """
    reached = [0] * len(steps)
    progress: dict[object, int] = {}
    for event in sorted(events, key=lambda e: e["created_at"]):
        visitor = event["visitor_id"]
        done = progress.get(visitor, 0)
        if done < len(steps) and _matches_step(steps[done], event):
            reached[done] += 1
            progress[visitor] = done + 1
    return reached


@router.get("/{domainId}")
async def list_funnels(
    domainId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("funnels")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)
        funnels = await funnel_service.list_by_domain(domain["id"])

        return jsjson(
            {
                "funnels": [
                    {
                        "id": f["id"],
                        "name": f["name"],
                        "description": f["description"],
                        "stepsCount": len(f["steps"]),
                        "createdAt": f["created_at"],
                        "updatedAt": f["updated_at"],
                    }
                    for f in funnels
                ]
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"List funnels error: {exc}")
        raise SimpleError(FAILED_LIST, 500) from None


@router.post("/{domainId}")
async def create_funnel(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("funnels")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        values, message = _validate_create(body)
        if message is not None:
            raise SimpleError(message, 400)

        funnel = await funnel_service.create(
            domain["id"], values["name"], values["description"], values["steps"]
        )
        if not funnel:
            raise SimpleError(FAILED_CREATE, 500)

        return jsjson(
            {
                "id": funnel["id"],
                "name": funnel["name"],
                "description": funnel["description"],
                "steps": [_step_payload(s) for s in funnel["steps"]],
                "createdAt": funnel["created_at"],
            },
            status_code=201,
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Create funnel error: {exc}")
        raise SimpleError(FAILED_CREATE, 500) from None


@router.get("/{domainId}/{funnelId}")
async def get_funnel(
    domainId: str,
    funnelId: str,
    startDate: str | None = Query(None),
    endDate: str | None = Query(None),
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("funnels")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        funnel = await funnel_service.get_by_id(funnelId)
        if not funnel or funnel["domain_id"] != domain["id"]:
            raise SimpleError("Funnel not found", 404)

        start_date, end_date = date_range(startDate, endDate, METRICS_LOOKBACK_DAYS)
        events = await event_service.query_by_domain(domain["id"], start_date, end_date)

        reached = _funnel_progress(funnel["steps"], events)
        steps_with_conversion = []
        for index, step in enumerate(funnel["steps"]):
            visitors = reached[index]
            previous = reached[index - 1] if index else visitors
            dropoff = previous - visitors
            steps_with_conversion.append(
                {
                    "id": step["id"],
                    "name": step["name"],
                    "type": step["type"],
                    "matchType": step["match_type"],
                    "matchValue": step["match_value"],
                    "matchField": step.get("match_field"),
                    "order": step["step_order"],
                    "visitors": visitors,
                    # Of the previous step's visitors, the share that reached this one.
                    "conversionRate": (
                        100
                        if index == 0
                        else js_round(visitors / previous * 10000) / 100
                        if previous
                        else 0
                    ),
                    "dropoff": dropoff,
                    "dropoffRate": js_round(dropoff / previous * 10000) / 100 if previous else 0,
                }
            )

        overall = (
            js_round(reached[-1] / reached[0] * 10000) / 100
            if reached and reached[0] > 0
            else 0
        )

        return jsjson(
            {
                "id": funnel["id"],
                "name": funnel["name"],
                "description": funnel["description"],
                "steps": steps_with_conversion,
                "totalVisitors": reached[0] if reached else 0,
                "completedFunnel": reached[-1] if reached else 0,
                "overallConversion": overall,
                "period": {"start": start_date, "end": end_date},
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Get funnel error: {exc}")
        raise SimpleError(FAILED_GET, 500) from None


@router.put("/{domainId}/{funnelId}")
async def update_funnel(
    domainId: str,
    funnelId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("funnels")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        existing = await funnel_service.get_by_id(funnelId)
        if not existing or existing["domain_id"] != domain["id"]:
            raise SimpleError("Funnel not found", 404)

        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        values, message = _validate_update(body)
        if message is not None:
            raise SimpleError(message, 400)

        # NOTE: `||` coerces an empty string to falsy, so an empty `description`
        # falls back to the existing value rather than clearing it.
        steps = values["steps"] or [
            {
                "name": s["name"],
                "type": s["type"],
                "matchType": s["match_type"],
                "matchValue": s["match_value"],
                "matchField": s.get("match_field"),
            }
            for s in existing["steps"]
        ]

        updated = await funnel_service.update(
            funnelId,
            values["name"] or existing["name"],
            values["description"] or existing["description"] or "",
            steps,
        )
        if not updated:
            raise SimpleError("Funnel not found", 404)

        return jsjson(
            {
                "id": updated["id"],
                "name": updated["name"],
                "description": updated["description"],
                "updatedAt": updated["updated_at"],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Update funnel error: {exc}")
        raise SimpleError(FAILED_UPDATE, 500) from None


@router.delete("/{domainId}/{funnelId}")
async def delete_funnel(
    domainId: str,
    funnelId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("funnels")),
):
    try:
        domain = await _require_owned_domain(domainId, user.user_id)

        funnel = await funnel_service.get_by_id(funnelId)
        if not funnel or funnel["domain_id"] != domain["id"]:
            raise SimpleError("Funnel not found", 404)

        await funnel_service.remove(funnelId)
        return jsjson({"message": "Funnel deleted successfully"})
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Delete funnel error: {exc}")
        raise SimpleError(FAILED_DELETE, 500) from None
