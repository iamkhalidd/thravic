"""Admin authorization — port of `middleware/adminAuth.ts`.

Note a deliberate asymmetry that is preserved from the Express implementation:
`adminAuth` verifies the JWT but does **not** consult the Redis revocation
blacklist, unlike `authenticate`. Porting that faithfully means a blacklisted
token is still accepted on admin routes until it expires — that is existing
behaviour, not a new bug, and it is called out here so nobody "fixes" it by
accident and diverges from the current API.
"""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Request

from ..db import query_one
from ..errors import SimpleError
from ..logging import create_logger
from ..security import get_jwt_secret
from .auth import AuthUser, bearer_token

log = create_logger("AdminAuth")

ADMIN_ROLES = ("admin", "super_admin")


@dataclass(frozen=True)
class AdminUser(AuthUser):
    role: str = "user"


async def _verify_and_load_role(request: Request) -> tuple[str, str, str]:
    """Verify the token and return `(userId, email, role)`."""
    token = bearer_token(request)
    if not token:
        raise SimpleError("No token provided", 401)

    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])
    except Exception:
        raise SimpleError("Invalid or expired token", 401) from None

    user_id = payload.get("userId", "")
    email = payload.get("email", "")

    row = await query_one("SELECT role FROM users WHERE id = $1", user_id)
    if not row:
        raise SimpleError("Admin access required", 403)

    return user_id, email, row.get("role") or "user"


async def admin_auth(request: Request) -> AdminUser:
    """Require `admin` or `super_admin`."""
    user_id, email, role = await _verify_and_load_role(request)

    if role not in ADMIN_ROLES:
        raise SimpleError("Admin access required", 403)

    request.state.user_id = user_id
    request.state.admin_role = role
    return AdminUser(user_id=user_id, email=email, role=role)


async def super_admin_auth(request: Request) -> AdminUser:
    """Require `super_admin` — used for destructive operations."""
    user_id, email, role = await _verify_and_load_role(request)

    if role != "super_admin":
        raise SimpleError("Super admin access required", 403)

    request.state.user_id = user_id
    request.state.admin_role = role
    return AdminUser(user_id=user_id, email=email, role=role)
