"""Feedback widget answers: `GET /api/feedback/{domainId}?days=`.

The widget itself is switched on in the site's settings (`feedbackWidget`,
`feedbackQuestion`); answers arrive through the collector as custom events
(see `feedback_service`). The owner and team members can read them.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query

from ..json_response import jsjson
from ..middleware.auth import AuthUser, require_auth
from ..services import feedback_service
from .visitors import _readable_domain

router = APIRouter()


@router.get("/{domainId}")
async def feedback(
    domainId: str,
    days: int = Query(30, ge=1, le=365),
    user: AuthUser = Depends(require_auth),
):
    domain = await _readable_domain(domainId, user.user_id)
    end = datetime.now(UTC)
    return jsjson(await feedback_service.summary(domain["id"], end - timedelta(days=days), end))
