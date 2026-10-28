"""Smart alerts history: `GET /api/alerts/{domainId}` lists a site's recent alerts.

Alerts are raised by the hourly job (`jobs/smart_alerts`, see `alert_service`);
the owner and team members can read them.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..errors import SimpleError
from ..json_response import jsjson
from ..middleware.auth import AuthUser, require_auth
from ..services import alert_service, domain_service

router = APIRouter()


@router.get("/{domainId}")
async def list_alerts(
    domainId: str,
    limit: int = Query(50, ge=1, le=200),
    user: AuthUser = Depends(require_auth),
):
    domain = await domain_service.get_by_id(domainId)
    if not domain or not (
        domain_service.is_owner(domain, user.user_id)
        or await domain_service.has_access(domainId, user.user_id)
    ):
        raise SimpleError("Domain not found", 404)
    return jsjson({"alerts": await alert_service.list_for_domain(str(domain["id"]), limit)})
