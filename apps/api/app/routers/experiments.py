"""Experiment routes — port of `routes/experiments.ts`.

Two Express quirks are preserved deliberately:

* `POST` converts a Zod failure into 400, but `PUT` has **no ZodError branch** —
  its bare `catch` turns invalid input into a 500. Same schema, different status.
* `GET` has no `try`/`catch` at all, so a database error escapes to the global
  error handler rather than a route-specific 500.

Access is checked by a route-level guard that allows the owner or a domain
**admin** member; a plain viewer gets 403 `Access denied`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ..db import query, query_one
from ..errors import PayloadError, SimpleError
from ..json_response import jsjson
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
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

    if issues:
        return None, issues

    return {
        "name": name,
        "status": status,
        "variants": parsed_variants,
        "trafficAllocation": traffic,
    }, []


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

        result = await query(
            """
            INSERT INTO experiments (domain_id, name, status, variants, traffic_allocation)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            """,
            domainId,
            values["name"],
            values["status"],
            values["variants"],
            values["trafficAllocation"],
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

        result = await query(
            """
            UPDATE experiments
            SET name = $1, status = $2, variants = $3, traffic_allocation = $4, updated_at = NOW()
            WHERE id = $5 AND domain_id = $6
            RETURNING *
            """,
            values["name"],
            values["status"],
            values["variants"],
            values["trafficAllocation"],
            experimentId,
            domainId,
        )
        return jsjson(result[0])
    except SimpleError:
        raise
    except Exception:
        raise SimpleError("Failed to update experiment", 500) from None
