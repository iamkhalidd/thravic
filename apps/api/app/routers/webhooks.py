"""Webhook management routes — port of `routes/webhooks.ts`.

Reads and writes return the raw row / array with no envelope. The access guard
allows the owner or a domain **admin** member.

The signing secret is write-only: responses carry `hasSecret` instead, so it is
not shown again after it is saved. Destinations on loopback or private networks
are refused (see `webhook_service.destination_error`).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ..db import query, query_one
from ..errors import PayloadError, SimpleError
from ..json_response import jsjson
from ..middleware.auth import AuthUser, require_auth
from ..middleware.feature_gate import require_feature
from ..services import webhook_service
from ..zod_lite import (
    issue_invalid_type,
    issue_too_small,
    js_type_of,
    string_field,
)

router = APIRouter()


def _public(webhook: dict) -> dict:
    """The row without its signing secret."""
    row = {key: value for key, value in webhook.items() if key != "secret"}
    row["hasSecret"] = bool(webhook.get("secret"))
    return row

ACCESS_DENIED = "Access denied"

# Event types the collector stores; a webhook subscribes to one or more of them.
EVENT_TYPES = ("pageview", "click", "scroll", "form", "custom", "session_end")
FAILED_CREATE = "Failed to create webhook"


async def _require_domain_access(domain_id: str, user_id: str) -> None:
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


@router.get("/{domainId}")
async def list_webhooks(
    domainId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("webhooks")),
):
    await _require_domain_access(domainId, user.user_id)

    webhooks = await query(
        "SELECT * FROM webhooks WHERE domain_id = $1 ORDER BY created_at DESC", domainId
    )
    return jsjson([_public(webhook) for webhook in webhooks])


@router.post("/{domainId}")
async def create_webhook(
    domainId: str,
    request: Request,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("webhooks")),
):
    try:
        await _require_domain_access(domainId, user.user_id)

        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        url, issue = string_field(body, "url", is_url=True)

        events = body.get("events")
        secret = body.get("secret")
        enabled = body.get("enabled")

        issues: list[dict] = []
        if issue:
            issues.append(issue)

        if events is None:
            issues.append(issue_invalid_type("events", "array", "undefined"))
        elif not isinstance(events, list):
            issues.append(issue_invalid_type("events", "array", js_type_of(events)))
        else:
            for index, entry in enumerate(events):
                if not isinstance(entry, str):
                    issues.append(
                        {
                            **issue_invalid_type("events", "string", js_type_of(entry)),
                            "path": ["events", index],
                        }
                    )
                    break
            else:
                if len(events) < 1:
                    issues.append(
                        issue_too_small(
                            "events", 1, "array", "Array must contain at least 1 element(s)"
                        )
                    )

        if secret is not None and not isinstance(secret, str):
            issues.append(issue_invalid_type("secret", "string", js_type_of(secret)))

        if enabled is not None and not isinstance(enabled, bool):
            issues.append(issue_invalid_type("enabled", "boolean", js_type_of(enabled)))

        if issues:
            # Express returns the whole Zod issue array here, not a single message
            raise PayloadError({"error": issues}, 400)

        unknown = sorted(set(events) - set(EVENT_TYPES))
        if unknown:
            raise SimpleError(
                f"Unknown event type(s): {', '.join(unknown)}. "
                f"Use: {', '.join(EVENT_TYPES)}",
                400,
            )

        refusal = await webhook_service.destination_error(url)
        if refusal:
            raise SimpleError(refusal, 400)

        result = await query(
            """
            INSERT INTO webhooks (domain_id, url, events, secret, enabled)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            """,
            domainId,
            url,
            events,
            secret or None,
            True if enabled is None else enabled,
        )
        return jsjson(_public(result[0]), status_code=201)
    except (PayloadError, SimpleError):
        raise
    except Exception:
        raise SimpleError(FAILED_CREATE, 500) from None


@router.delete("/{domainId}/{webhookId}")
async def delete_webhook(
    domainId: str,
    webhookId: str,
    user: AuthUser = Depends(require_auth),
    _feature: None = Depends(require_feature("webhooks")),
):
    await _require_domain_access(domainId, user.user_id)

    await query(
        "DELETE FROM webhooks WHERE id = $1 AND domain_id = $2", webhookId, domainId
    )
    return jsjson({"message": "Webhook deleted"})
