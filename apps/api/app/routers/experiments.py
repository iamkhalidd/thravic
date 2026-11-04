"""Experiment routes — port of `routes/experiments.ts`.

Two Express quirks are preserved deliberately:

* `POST` converts a Zod failure into 400, but `PUT` has **no ZodError branch** —
  its bare `catch` turns invalid input into a 500. Same schema, different status.
* `GET` has no `try`/`catch` at all, so a database error escapes to the global
  error handler rather than a route-specific 500.

Access is checked by a route-level guard that allows the owner or a domain
**admin** member; a plain viewer gets 403 `Access denied`.

Added since the port: a `key` the site's code asks for (`TF('variant', key)`),
made from the name when not given; a `goalEvent` that counts as a conversion;
the start and end times, set when the status changes; `DELETE`; and live
results (`experiment_service.results`).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ..db import query, query_one
from ..errors import PayloadError, SimpleError
from ..json_response import jsjson
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
from ..services import experiment_service
from ..zod_lite import (
    enum_field,
    issue_invalid_type,
    issue_too_small,
    js_type_of,
    number_field,
    string_field,
)

router = APIRouter()

STATUSES = ("draft", "active", "ended")
MIN_VARIANTS = 2

ACCESS_DENIED = "Access denied"
KEY_PATTERN = r"^[a-z0-9][a-z0-9-]{0,79}$"
KEY_TAKEN = "Another experiment on this site already uses this key"
NOT_FOUND = "Experiment not found"


async def _require_domain_access(domain_id: str, user_id: str) -> None:
    """Owner, or a member whose role is exactly `admin`."""
    access = await query_one(
        """
        SELECT 1 FROM domains WHERE id = $1 AND user_id = $2
        UNION
        SELECT 1 FROM domain_members WHERE domain_id = $1 AND user_id = $2 AND role = 'admin'
        """,
        domain_id,
        user_id,
    )
    if access is None:
        raise SimpleError(ACCESS_DENIED, 403)


def _validate(payload: dict) -> tuple[dict | None, list[dict]]:
    """`experimentSchema.parse` — returns (values, issues)."""
    issues: list[dict] = []

    name, issue = string_field(payload, "name", min_length=1)
    if issue:
        issues.append(issue)

    status, issue = enum_field(payload, "status", STATUSES, required=False, default="draft")
    if issue:
        issues.append(issue)

    variants = payload.get("variants")
    parsed_variants: list[dict] = []
    if variants is None:
        issues.append(issue_invalid_type("variants", "array", "undefined"))
    elif not isinstance(variants, list):
        issues.append(issue_invalid_type("variants", "array", js_type_of(variants)))
    else:
        for index, variant in enumerate(variants):
            if not isinstance(variant, dict):
                issues.append(issue_invalid_type("variants", "object", js_type_of(variant)))
                break

            variant_id, issue = string_field(variant, "id")
            if issue:
                issues.append({**issue, "path": ["variants", index, "id"]})
                break

            variant_name, issue = string_field(variant, "name")
            if issue:
                issues.append({**issue, "path": ["variants", index, "name"]})
                break

            weight, issue = number_field(variant, "weight", minimum=0, maximum=100)
            if issue:
                issues.append({**issue, "path": ["variants", index, "weight"]})
                break

            parsed_variants.append({"id": variant_id, "name": variant_name, "weight": weight})
        else:
            if len(parsed_variants) < MIN_VARIANTS:
                issues.append(
                    issue_too_small(
                        "variants", MIN_VARIANTS, "array", "At least 2 variants required"
                    )
                )

    traffic, issue = number_field(
        payload, "trafficAllocation", required=False, default=100, minimum=0, maximum=100
    )
    if issue:
        issues.append(issue)

    key, issue = string_field(
        payload,
        "key",
        required=False,
        pattern=KEY_PATTERN,
        pattern_message="Use lowercase letters, numbers and dashes",
    )
    if issue:
        issues.append(issue)

    goal, issue = string_field(payload, "goalEvent", required=False)
    if issue:
        issues.append(issue)

    if issues:
        return None, issues

    return {
        "name": name,
        "status": status,
        "variants": parsed_variants,
        "trafficAllocation": traffic,
        "key": key,
        "goalEvent": (goal.strip() or None) if goal is not None else None,
    }, []


async def _free_key(domain_id: str, wanted: str, experiment_id: str | None = None) -> str:
    """`wanted`, or with a number added when another test on the site has it."""
    taken = {
        r["key"]
        for r in await query(
            "SELECT key FROM experiments WHERE domain_id = $1 AND key LIKE $2 "
            "AND ($3::uuid IS NULL OR id <> $3::uuid)",
            domain_id,
            f"{wanted}%",
            experiment_id,
        )
    }
    key, n = wanted, 2
    while key in taken:
        key = f"{wanted[: experiment_service.KEY_MAX - 4]}-{n}"
        n += 1
    return key


@router.get("/{domainId}")
async def list_experiments(
    domainId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("experiments")),
):
    # No try/catch in Express — errors propagate to the global handler.
    await _require_domain_access(domainId, user.user_id)

    experiments = await query(
        "SELECT * FROM experiments WHERE domain_id = $1 ORDER BY created_at DESC", domainId
    )
    return jsjson(experiments)


@router.post("/{domainId}")
async def create_experiment(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("experiments")),
):
    try:
        await _require_domain_access(domainId, user.user_id)

        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        values, issues = _validate(body)
        if issues:
            # Express returns the whole Zod issue array here, not a single message
            raise PayloadError({"error": issues}, 400)

        if values["key"]:
            if await _free_key(domainId, values["key"]) != values["key"]:
                raise SimpleError(KEY_TAKEN, 409)
            key = values["key"]
        else:
            key = await _free_key(domainId, experiment_service.make_key(values["name"]))

        result = await query(
            """
            INSERT INTO experiments (domain_id, name, status, variants, traffic_allocation,
                                     key, goal_event, started_at, ended_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7,
                    CASE WHEN $3 IN ('active', 'ended') THEN NOW() END,
                    CASE WHEN $3 = 'ended' THEN NOW() END)
            RETURNING *
            """,
            domainId,
            values["name"],
            values["status"],
            values["variants"],
            values["trafficAllocation"],
            key,
            values["goalEvent"],
        )
        return jsjson(result[0], status_code=201)
    except (PayloadError, SimpleError):
        raise
    except Exception:
        raise SimpleError("Failed to create experiment", 500) from None


@router.put("/{domainId}/{experimentId}")
async def update_experiment(
    domainId: str,
    experimentId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("experiments")),
):
    try:
        await _require_domain_access(domainId, user.user_id)

        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        # Preserved Express bug: this handler has no ZodError branch, so invalid
        # input returns 500 rather than 400.
        values, issues = _validate(body)
        if issues:
            raise SimpleError("Failed to update experiment", 500)

        if values["key"] and (
            await _free_key(domainId, values["key"], experimentId) != values["key"]
        ):
            raise SimpleError(KEY_TAKEN, 409)

        # Started when first made active; ended when ended, and running again
        # (no end) if made active after that.
        result = await query(
            """
            UPDATE experiments
            SET name = $1, status = $2, variants = $3, traffic_allocation = $4,
                key = COALESCE($7, key), goal_event = $8,
                started_at = CASE WHEN $2 IN ('active', 'ended')
                                  THEN COALESCE(started_at, NOW()) ELSE started_at END,
                ended_at = CASE WHEN $2 = 'ended' THEN COALESCE(ended_at, NOW())
                                WHEN $2 = 'active' THEN NULL ELSE ended_at END,
                updated_at = NOW()
            WHERE id = $5 AND domain_id = $6
            RETURNING *
            """,
            values["name"],
            values["status"],
            values["variants"],
            values["trafficAllocation"],
            experimentId,
            domainId,
            values["key"],
            values["goalEvent"],
        )
        return jsjson(result[0])
    except SimpleError:
        raise
    except Exception:
        raise SimpleError("Failed to update experiment", 500) from None


async def _experiment(domain_id: str, experiment_id: str) -> dict:
    try:
        row = await query_one(
            "SELECT * FROM experiments WHERE id = $1::uuid AND domain_id = $2",
            experiment_id,
            domain_id,
        )
    except Exception:
        row = None  # not a uuid
    if row is None:
        raise SimpleError(NOT_FOUND, 404)
    return row


@router.delete("/{domainId}/{experimentId}")
async def delete_experiment(
    domainId: str,
    experimentId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("experiments")),
):
    await _require_domain_access(domainId, user.user_id)
    await _experiment(domainId, experimentId)
    await query(
        "DELETE FROM experiments WHERE id = $1::uuid AND domain_id = $2 RETURNING 1",
        experimentId,
        domainId,
    )
    return jsjson({"success": True})


@router.get("/{domainId}/{experimentId}/results")
async def experiment_results(
    domainId: str,
    experimentId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("experiments")),
):
    """Results counted now, rather than the daily check's stored copy."""
    await _require_domain_access(domainId, user.user_id)
    experiment = await _experiment(domainId, experimentId)
    return jsjson(await experiment_service.results(experiment))
