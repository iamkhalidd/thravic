"""Ask Thravic: plain-language questions about one site, answered from its data.

Gated like AI insights (`require_feature('insights')`, checked against the
site owner's plan), and open to the owner and invited team members. Each user
gets `assistant_service.DAILY_LIMITS` questions a day. See `assistant_service`.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..errors import SimpleError
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
from ..services import assistant_service, domain_service

log = create_logger("Assistant")

router = APIRouter()


class _Message(BaseModel):
    role: str = Field(max_length=20)
    content: str = Field(max_length=4000)


class _AskBody(BaseModel):
    question: str = Field(min_length=1, max_length=assistant_service.MAX_MESSAGE_CHARS)
    history: list[_Message] = Field(default_factory=list, max_length=40)
    # Where the user is: path, pageTitle, startDate, endDate (ISO) and tzOffset
    # (the browser's getTimezoneOffset()).
    context: dict[str, Any] = Field(default_factory=dict)


async def _site(domain_id: str, user_id: str) -> dict:
    domain = await domain_service.get_by_id(domain_id)
    if not domain or not await domain_service.has_access(domain_id, user_id):
        raise SimpleError("Domain not found", 404)
    return domain


async def _usage(domain_id: str, user_id: str) -> dict[str, int]:
    limit = await assistant_service.daily_limit(domain_id)
    used = await assistant_service.asked_today(user_id, datetime.now(UTC))
    return {"used": used, "limit": limit, "left": max(0, limit - used)}


@router.get("/{domainId}/usage")
async def usage(
    domainId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("insights")),
):
    await _site(domainId, user.user_id)
    return jsjson(await _usage(domainId, user.user_id))


@router.post("/{domainId}/ask")
async def ask(
    domainId: str,
    body: _AskBody,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("insights")),
):
    domain = await _site(domainId, user.user_id)
    question = body.question.strip()
    if not question:
        raise SimpleError("Type a question first", 400)

    counts = await _usage(domainId, user.user_id)
    if counts["left"] <= 0:
        raise SimpleError(
            f"You've asked {counts['limit']} questions today, the most your plan allows. "
            "You can ask again tomorrow.",
            429,
        )

    try:
        reply = await assistant_service.answer(
            domain,
            question,
            [message.model_dump() for message in body.history],
            body.context,
        )
    except Exception as exc:
        log.error(f"Assistant error: {exc}")
        raise SimpleError("Couldn't answer that just now. Please try again.", 500) from None

    if reply["answer"] not in (assistant_service.NOT_SET_UP, assistant_service.NO_ANSWER):
        await assistant_service.record_question(user.user_id, domainId)
        counts = {**counts, "used": counts["used"] + 1, "left": counts["left"] - 1}
    return jsjson({**reply, "usage": counts})
