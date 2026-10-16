"""Two-step sign-in for the admin panel.

An admin signs in with their password and then a 6-digit code from an
authenticator app (Google Authenticator, 1Password, Authy...). The codes are
standard TOTP (RFC 6238: SHA-1, 6 digits, 30-second steps), written out here
rather than pulled in as a package because it is twenty lines.

Between the two steps the panel holds a *ticket*: a JWT that lives five minutes
and says only "this person got the password right". It cannot call any admin
route. Setting up the app for the first time also needs a code emailed to the
admin, so someone who only has the password cannot attach their own phone.

Admin access tokens carry `adm: True`; `admin_auth` refuses any token without
it, so a normal sign-in on the web app never opens the admin API. Admin
sessions are short: the refresh token lasts `ADMIN_IDLE_MINUTES` and is replaced
on every use, so a panel left alone signs itself out, and no session outlives
`ADMIN_SESSION_HOURS` from the moment the code was entered.

The authenticator key is stored encrypted with a key derived from `JWT_SECRET`.
Changing `JWT_SECRET` therefore means admins set the app up again
(`python -m app.scripts.reset_admin_2fa <email>`).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote

import jwt
from cryptography.fernet import Fernet, InvalidToken

from ..security import get_jwt_refresh_secret, get_jwt_secret
from . import token_store

ISSUER = "Thravic Admin"
STEP_SECONDS = 30
DIGITS = 6
# Codes from one step either side are accepted, for phones whose clock drifts.
DRIFT_STEPS = 1

TICKET_MINUTES = 5
ADMIN_ACCESS_MINUTES = 15
ADMIN_IDLE_MINUTES = 30
ADMIN_SESSION_HOURS = 12

TICKET_PURPOSE = "admin_2fa"
ADMIN_CLAIM = "adm"


# ── Codes ─────────────────────────────────────────────────────────────────────


def new_secret() -> str:
    """A fresh 160-bit key in base32, the form authenticator apps expect."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _key_bytes(secret: str) -> bytes:
    padded = secret.upper() + "=" * (-len(secret) % 8)
    return base64.b32decode(padded)


def code_at(secret: str, step: int) -> str:
    """The code for one 30-second step (RFC 4226 dynamic truncation)."""
    digest = hmac.new(_key_bytes(secret), struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(number % 10**DIGITS).zfill(DIGITS)


def current_step(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // STEP_SECONDS)


def matching_step(
    secret: str, code: str, last_step: int | None = None, now: float | None = None
) -> int | None:
    """The step `code` belongs to, or None. A step at or before `last_step` was
    already used and is refused, so a code seen over someone's shoulder is spent."""
    code = "".join(ch for ch in str(code) if ch.isdigit())
    if len(code) != DIGITS:
        return None
    step = current_step(now)
    for candidate in range(step - DRIFT_STEPS, step + DRIFT_STEPS + 1):
        if last_step is not None and candidate <= last_step:
            continue
        if hmac.compare_digest(code_at(secret, candidate), code):
            return candidate
    return None


def otpauth_url(secret: str, email: str) -> str:
    """What the setup QR code holds."""
    label = quote(f"{ISSUER}:{email}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(ISSUER)}&digits={DIGITS}&period={STEP_SECONDS}"


# ── Storing the key ──────────────────────────────────────────────────────────


def _fernet() -> Fernet:
    digest = hashlib.sha256(("thravic-admin-2fa:" + get_jwt_secret()).encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode("ascii")).decode("ascii")


def decrypt_secret(stored: str) -> str | None:
    """None when the key cannot be read (JWT_SECRET changed since setup)."""
    try:
        return _fernet().decrypt(stored.encode("ascii")).decode("ascii")
    except (InvalidToken, ValueError):
        return None


def new_email_code() -> str:
    return str(secrets.randbelow(10**DIGITS)).zfill(DIGITS)


def _hash_email_code(code: str, user_id: str) -> str:
    return hmac.new(
        get_jwt_secret().encode("utf-8"), f"{user_id}:{code}".encode(), hashlib.sha256
    ).hexdigest()


# ── Tickets and sessions ─────────────────────────────────────────────────────


def issue_ticket(
    user_id: str, email: str, *, setup_secret: str | None = None, email_code: str | None = None
) -> str:
    """The token held between the password and the code. During setup it also
    carries the new key (encrypted) and a hash of the emailed code."""
    now = datetime.now(UTC)
    claims: dict[str, Any] = {
        "purpose": TICKET_PURPOSE,
        "userId": str(user_id),
        "email": email,
        "iat": now,
        "exp": now + timedelta(minutes=TICKET_MINUTES),
    }
    if setup_secret:
        claims["setup"] = encrypt_secret(setup_secret)
    if email_code:
        claims["emailCode"] = _hash_email_code(email_code, str(user_id))
    return jwt.encode(claims, get_jwt_secret(), algorithm="HS256")


def read_ticket(ticket: str) -> dict[str, Any] | None:
    try:
        claims = jwt.decode(ticket, get_jwt_secret(), algorithms=["HS256"])
    except Exception:
        return None
    return claims if claims.get("purpose") == TICKET_PURPOSE else None


def email_code_matches(claims: dict[str, Any], code: str) -> bool:
    expected = claims.get("emailCode")
    if not expected:
        return False
    given = _hash_email_code("".join(ch for ch in str(code) if ch.isdigit()), claims["userId"])
    return hmac.compare_digest(expected, given)


async def issue_admin_tokens(
    user_id: str, email: str, session_started: datetime | None = None
) -> dict[str, Any]:
    """An admin access/refresh pair. `session_started` is carried forward on
    refresh so the 12-hour cap counts from the original code entry."""
    now = datetime.now(UTC)
    started = session_started or now
    access = jwt.encode(
        {
            "userId": str(user_id),
            "email": email,
            ADMIN_CLAIM: True,
            "iat": now,
            "exp": now + timedelta(minutes=ADMIN_ACCESS_MINUTES),
        },
        get_jwt_secret(),
        algorithm="HS256",
    )
    refresh_expires = min(
        now + timedelta(minutes=ADMIN_IDLE_MINUTES),
        started + timedelta(hours=ADMIN_SESSION_HOURS),
    )
    refresh = jwt.encode(
        {
            "userId": str(user_id),
            "email": email,
            ADMIN_CLAIM: True,
            "sessionStarted": int(started.timestamp()),
            "nonce": secrets.token_hex(8),
            "iat": now,
            "exp": refresh_expires,
        },
        get_jwt_refresh_secret(),
        algorithm="HS256",
    )
    await token_store.store_refresh_token(refresh)
    return {
        "accessToken": access,
        "refreshToken": refresh,
        "accessExpiresIn": ADMIN_ACCESS_MINUTES * 60,
        "refreshExpiresAt": int(refresh_expires.timestamp()),
    }


def read_admin_refresh(token: str) -> dict[str, Any] | None:
    try:
        claims = jwt.decode(token, get_jwt_refresh_secret(), algorithms=["HS256"])
    except Exception:
        return None
    return claims if claims.get(ADMIN_CLAIM) is True else None
