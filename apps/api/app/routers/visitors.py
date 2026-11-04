"""Visitors: retention, the visitor list and one visitor's profile.

- `GET /api/visitors/{domainId}/retention?weeks=` — weekly cohorts (`cohort_service`).
- `GET /api/visitors/{domainId}?search=&limit=&segment=` — most recently seen
  visitors, or with `segment` (`likely` to convert, `at_risk` of not coming back)
  the strongest of the recent ones in it.
- `GET /api/visitors/{domainId}/{visitorId}` — one visitor's sessions and timeline
  (`visitor_profile_service`); `visitorId` is the `visitors.id` UUID.

Visitors carry their scores (`visitor_score_service`), and the response says what
the conversion model is and whether it is good enough to show.

The owner and team members can read them, on every plan.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, Query

from ..errors import SimpleError
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..services import (
    cohort_service,
    domain_service,
    visitor_profile_service,
    visitor_score_service,
)

log = create_logger("Visitors")

router = APIRouter()


async def _readable_domain(domain_id: str, user_id: str) -> dict:
    domain = await domain_service.get_by_id(domain_id)
    if not domain or not (
        domain_service.is_owner(domain, user_id)
        or await domain_service.has_access(domain_id, user_id)
    ):
        raise SimpleError("Domain not found", 404)
    return domain


async def _scored(
    domain_id: Any, visitors: list[dict]
) -> tuple[dict[str, dict], dict[str, Any] | None]:
    """Scores for these visitors and the model info; none if scoring fails, so a
    model problem never takes the visitor list down with it."""
    try:
        loaded = await visitor_score_service.load(domain_id)
        scores = await visitor_score_service.score(
            domain_id, [v["id"] for v in visitors], loaded
        )
        return scores, visitor_score_service.model_info(loaded)
    except Exception as exc:  # noqa: BLE001
        log.error(f"Visitor scoring failed: {exc}")
        return {}, None


@router.get("/{domainId}/retention")
async def retention(
    domainId: str,
    weeks: int = Query(cohort_service.DEFAULT_WEEKS, ge=2, le=cohort_service.MAX_WEEKS),
    user: AuthUser = Depends(require_auth),
):
    domain = await _readable_domain(domainId, user.user_id)
    return jsjson(await cohort_service.cohorts(domain["id"], weeks))


@router.get("/{domainId}")
async def list_visitors(
    domainId: str,
    search: str | None = Query(None, max_length=100),
    limit: int = Query(
        visitor_profile_service.DEFAULT_LIMIT, ge=1, le=visitor_profile_service.MAX_LIMIT
    ),
    segment: Literal["likely", "at_risk"] | None = Query(None),
    user: AuthUser = Depends(require_auth),
):
    domain = await _readable_domain(domainId, user.user_id)
    visitors = await visitor_profile_service.list_visitors(
        domain["id"],
        (search or "").strip() or None,
        visitor_score_service.SEGMENT_POOL if segment else limit,
    )
    scores, model = await _scored(domain["id"], visitors)
    for visitor in visitors:
        visitor["score"] = scores.get(str(visitor["id"]))
    if segment:
        ranked = [
            (strength, visitor)
            for visitor in visitors
            if (strength := visitor_score_service.in_segment(visitor["score"], segment))
            is not None
        ]
        ranked.sort(key=lambda pair: -pair[0])
        visitors = [visitor for _, visitor in ranked[:limit]]
    return jsjson({"visitors": visitors, "model": model})


@router.get("/{domainId}/{visitorId}")
async def visitor_profile(
    domainId: str, visitorId: str, user: AuthUser = Depends(require_auth)
):
    domain = await _readable_domain(domainId, user.user_id)
    profile = await visitor_profile_service.profile(domain["id"], visitorId)
    if profile is None:
        raise SimpleError("Visitor not found", 404)
    scores, model = await _scored(domain["id"], [profile["visitor"]])
    profile["visitor"]["score"] = scores.get(str(profile["visitor"]["id"]))
    profile["model"] = model
    return jsjson(profile)
