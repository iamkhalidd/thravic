"""Visitors: retention, the visitor list and one visitor's profile.

- `GET /api/visitors/{domainId}/retention?weeks=` — weekly cohorts (`cohort_service`).
- `GET /api/visitors/{domainId}?search=&limit=` — most recently seen visitors.
- `GET /api/visitors/{domainId}/{visitorId}` — one visitor's sessions and timeline
  (`visitor_profile_service`); `visitorId` is the `visitors.id` UUID.

The owner and team members can read them, on every plan.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..errors import SimpleError
from ..json_response import jsjson
from ..middleware.auth import AuthUser, require_auth
from ..services import cohort_service, domain_service, visitor_profile_service

router = APIRouter()


async def _readable_domain(domain_id: str, user_id: str) -> dict:
    domain = await domain_service.get_by_id(domain_id)
    if not domain or not (
        domain_service.is_owner(domain, user_id)
        or await domain_service.has_access(domain_id, user_id)
    ):
        raise SimpleError("Domain not found", 404)
    return domain


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
    user: AuthUser = Depends(require_auth),
):
    domain = await _readable_domain(domainId, user.user_id)
    visitors = await visitor_profile_service.list_visitors(
        domain["id"], (search or "").strip() or None, limit
    )
    return jsjson({"visitors": visitors})


@router.get("/{domainId}/{visitorId}")
async def visitor_profile(
    domainId: str, visitorId: str, user: AuthUser = Depends(require_auth)
):
    domain = await _readable_domain(domainId, user.user_id)
    profile = await visitor_profile_service.profile(domain["id"], visitorId)
    if profile is None:
        raise SimpleError("Visitor not found", 404)
    return jsjson(profile)
