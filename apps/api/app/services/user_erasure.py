"""Erasing a person: what "delete my account" must remove (NDPA / GDPR).

Deleting the `users` row cascades to their sites, events, sessions,
recordings, heatmaps, funnels, team seats, subscriptions and notices. Two
things are left that the cascade does not reach, and this clears them:

- the avatar file on disk;
- admin audit entries about the person, whose details can hold their email or
  profile fields (the entry itself stays, so the log still shows what was done).

Only what the law asks to keep survives: payment records and promo
redemptions keep the amount and date for the books, with the link to the
person removed (ON DELETE SET NULL).

Every delete path (self-delete, admin delete, the under-18 cleanup) goes
through `erase_user`.
"""

from __future__ import annotations

from pathlib import Path

from ..db import query, query_one
from ..logging import create_logger

log = create_logger("UserErasure")

AVATAR_PREFIX = "/uploads/avatars/"


def mask_email(email: str | None) -> str:
    """"kh•••@gmail.com": enough to recognise the entry, not to contact anyone."""
    if not email or "@" not in email:
        return "•••"
    name, _, domain = email.rpartition("@")
    return f"{name[:2]}•••@{domain}"


async def erase_user(user_id: str) -> bool:
    """Delete the account and everything tied to the person. False if no such user."""
    row = await query_one("SELECT avatar_url FROM users WHERE id = $1", user_id)
    if row is None:
        return False

    await query("DELETE FROM users WHERE id = $1", user_id)

    avatar = row.get("avatar_url") or ""
    if avatar.startswith(AVATAR_PREFIX):
        try:
            (Path.cwd() / avatar.lstrip("/")).unlink(missing_ok=True)
        except OSError as exc:
            log.error(f"Could not remove avatar for erased user {user_id}: {exc}")

    try:
        await query(
            """
            UPDATE admin_audit_log SET details = '{"erased": true}'::jsonb
            WHERE target_type = 'user' AND target_id = $1
            """,
            user_id,
        )
    except Exception as exc:  # noqa: BLE001 - the account itself is already gone
        log.error(f"Could not scrub audit entries for erased user {user_id}: {exc}")
    return True
