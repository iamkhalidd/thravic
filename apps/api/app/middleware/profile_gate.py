"""Dashboard data needs a complete profile, and none for restricted accounts.

Applied to the dashboard's data routers in `main.py` (not to auth, payments,
collection or admin). A user whose profile is missing a required field gets 403
with `profileIncomplete`, so the dashboard sends them to finish it; a restricted
account (under 18) gets 403 with `restricted`.

Only "all good" answers are cached, briefly, so finishing a profile takes effect
at once on every instance while restricting one may take up to a minute.
"""

from __future__ import annotations

import time

from fastapi import Request

from .. import profile
from ..db import query_one
from ..errors import PayloadError
from ..logging import create_logger
from .auth import _decode, bearer_token

log = create_logger("ProfileGate")

OK_CACHE_SECONDS = 60
INCOMPLETE_MESSAGE = "Complete your profile to continue."

_ok_until: dict[str, float] = {}


def forget(user_id: str) -> None:
    """Drop the cached answer after the user's profile or restriction changes."""
    _ok_until.pop(str(user_id), None)


async def profile_gate(request: Request) -> None:
    token = bearer_token(request)
    if not token:
        return  # the route's own auth answers 401
    try:
        user_id = _decode(token).user_id
    except Exception:
        return
    if _ok_until.get(user_id, 0) > time.monotonic():
        return

    try:
        row = await query_one(
            "SELECT name, date_of_birth, country, phone, restricted_reason "
            "FROM users WHERE id = $1",
            user_id,
        )
    except Exception as exc:  # noqa: BLE001 — the route will hit the same database
        log.error(f"Profile check failed: {exc}")
        return
    if row is None:
        return

    if row["restricted_reason"]:
        raise PayloadError(
            {"error": profile.UNDERAGE_MESSAGE, "restricted": row["restricted_reason"]}, 403
        )
    missing = profile.missing_fields(row)
    if missing:
        raise PayloadError(
            {"error": INCOMPLETE_MESSAGE, "profileIncomplete": True, "missingFields": missing},
            403,
        )
    _ok_until[user_id] = time.monotonic() + OK_CACHE_SECONDS
