"""Authentication dependencies — port of `middleware/auth.ts`.

Express attaches `req.userId` / `req.email`; here an `AuthUser` is injected with
`Depends(require_auth)` and stashed on `request.state` for logging.

Responses use `SimpleError` rather than `AppError`, because the Express middleware
replies directly with `res.status(...).json({ error })` — those bodies have no
`code` field. Adding one would be a visible difference to the frontends.
"""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Request

from ..errors import SimpleError
from ..logging import create_logger
from ..redis_client import get_client
from ..security import get_jwt_secret

log = create_logger("Auth")

NO_TOKEN = "No token provided"
TOKEN_REVOKED = "Token revoked"
INVALID_TOKEN = "Invalid or expired token"


@dataclass(frozen=True)
class AuthUser:
    """The decoded identity, equivalent to `req.userId` + `req.email`."""

    user_id: str
    email: str


def bearer_token(request: Request) -> str | None:
    """Extract a bearer token. Returns `None` when the header is absent/malformed."""
    header = request.headers.get("authorization")
    if not header or not header.startswith("Bearer "):
        return None
    parts = header.split(" ")
    return parts[1] if len(parts) > 1 else ""


async def _is_blacklisted(token: str) -> bool:
    """Check the Redis revocation list written on logout (`bl:<token>`)."""
    client = get_client()
    if client is None:
        return False
    try:
        return bool(await client.exists(f"bl:{token}"))
    except Exception:
        return False


def _decode(token: str) -> AuthUser:
    payload = jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])
    return AuthUser(user_id=payload.get("userId", ""), email=payload.get("email", ""))


async def require_auth(request: Request) -> AuthUser:
    """Reject the request unless a valid, non-revoked access token is present."""
    token = bearer_token(request)
    if not token:
        raise SimpleError(NO_TOKEN, 401)

    if await _is_blacklisted(token):
        raise SimpleError(TOKEN_REVOKED, 401)

    try:
        user = _decode(token)
    except Exception:
        raise SimpleError(INVALID_TOKEN, 401) from None

    request.state.user_id = user.user_id
    request.state.email = user.email
    return user


async def optional_auth(request: Request) -> AuthUser | None:
    """Attach identity when a valid token is present, but never reject."""
    token = bearer_token(request)
    if not token or await _is_blacklisted(token):
        return None

    try:
        user = _decode(token)
    except Exception:
        return None

    request.state.user_id = user.user_id
    request.state.email = user.email
    return user
