"""Admin sign-in: password, then a code from an authenticator app.

These routes sit outside `admin_auth` (nobody is signed in yet). The flow:

1. `POST /login` with email and password. An admin who has set up the app gets
   a ticket and `step: "code"`. One who has not gets `step: "setup"`, a new key
   to scan, and an emailed code that proves they own the inbox.
2. `POST /verify` with the ticket and the app's code (plus the emailed code
   during setup) returns an admin session. See `services/admin_2fa.py`.
3. `POST /refresh` replaces the pair; `POST /logout` ends it.

Wrong passwords and codes on admin accounts are written to the audit log.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime

from fastapi import APIRouter, Request

from ...db import query_one
from ...errors import SimpleError
from ...json_response import jsjson
from ...logging import create_logger
from ...middleware.admin_auth import ADMIN_ROLES, check_proxy_secret
from ...services import admin_2fa, email_service, token_store
from ...services.audit_service import log_action
from ...services.user_service import find_by_email, find_by_id
from ..auth import SUSPENDED_ROLE, verify_password
from ._util import client_ip, fire_and_forget

log = create_logger("Admin:Session")

router = APIRouter()

INVALID = "Wrong email or password"
# Wrong codes per admin account before it is locked for the window.
MAX_CODE_FAILURES = 8
CODE_FAILURE_WINDOW_SECONDS = 15 * 60
# user id -> (window ends at, wrong codes). Per process, like the local rate
# limiter: enough to stop guessing, on top of the per-IP auth limit.
_code_failures: dict[str, tuple[float, int]] = {}


async def _body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}


def _is_admin(user: dict | None) -> bool:
    return bool(user) and user.get("role") in ADMIN_ROLES


@router.post("/login")
async def login(request: Request):
    check_proxy_secret(request)
    body = await _body(request)
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    if not email or not password:
        raise SimpleError("Enter your email and password", 400)

    user = await find_by_email(email)
    if user and user.get("role") == SUSPENDED_ROLE:
        raise SimpleError(INVALID, 401)
    if not user or not user.get("password") or not verify_password(password, user["password"]):
        if _is_admin(user):
            await log_action(
                admin_id=str(user["id"]), action="admin.sign_in_failed",
                target_type="user", target_id=str(user["id"]),
                details={"reason": "password"}, ip_address=client_ip(request),
            )
        raise SimpleError(INVALID, 401)
    # Same answer as a wrong password: the panel does not confirm who is an admin.
    if not _is_admin(user):
        raise SimpleError(INVALID, 401)

    user_id = str(user["id"])
    if user.get("totp_enabled_at") and user.get("totp_secret"):
        return jsjson({"step": "code", "ticket": admin_2fa.issue_ticket(user_id, user["email"])})

    secret = admin_2fa.new_secret()
    email_code = admin_2fa.new_email_code()
    await email_service.send_admin_setup_code_email(
        user["email"], user.get("name") or "", email_code
    )
    return jsjson(
        {
            "step": "setup",
            "ticket": admin_2fa.issue_ticket(
                user_id, user["email"], setup_secret=secret, email_code=email_code
            ),
            "secret": secret,
            "otpauthUrl": admin_2fa.otpauth_url(secret, user["email"]),
        }
    )


@router.post("/verify")
async def verify(request: Request):
    check_proxy_secret(request)
    body = await _body(request)
    claims = admin_2fa.read_ticket(str(body.get("ticket") or ""))
    if not claims:
        raise SimpleError("This sign-in has expired. Start again.", 401)

    user_id = claims["userId"]
    if _failures(user_id) >= MAX_CODE_FAILURES:
        raise SimpleError("Too many wrong codes. Wait 15 minutes and try again.", 429)

    user = await find_by_id(user_id)
    if not _is_admin(user):
        raise SimpleError("Admin access required", 403)

    ip = client_ip(request)
    code = str(body.get("code") or "")
    setup_secret_enc = claims.get("setup")

    if setup_secret_enc:
        secret = admin_2fa.decrypt_secret(setup_secret_enc)
        if not secret or not admin_2fa.email_code_matches(claims, str(body.get("emailCode") or "")):
            await _record_failure(user_id, ip, "email_code")
            raise SimpleError("The emailed code is wrong", 401)
        step = admin_2fa.matching_step(secret, code)
        if step is None:
            await _record_failure(user_id, ip, "setup_code")
            raise SimpleError("The app code is wrong. Check the time on your phone.", 401)
        await query_one(
            """
            UPDATE users SET totp_secret = $2, totp_enabled_at = NOW(), totp_last_step = $3
            WHERE id = $1 RETURNING id
            """,
            user_id, admin_2fa.encrypt_secret(secret), step,
        )
        await log_action(
            admin_id=user_id, action="admin.2fa_enabled", target_type="user",
            target_id=user_id, ip_address=ip,
        )
        fire_and_forget(
            email_service.send_admin_2fa_enabled_email(user["email"], user.get("name") or "", ip)
        )
    else:
        secret = admin_2fa.decrypt_secret(user.get("totp_secret") or "")
        if not secret:
            raise SimpleError(
                "Your authenticator key can't be read. Ask the owner to reset "
                "two-step sign-in on your account.",
                409,
            )
        # BIGINT column: the int8 codec hands it back as a string.
        last_step = user.get("totp_last_step")
        step = admin_2fa.matching_step(
            secret, code, int(last_step) if last_step is not None else None
        )
        # The conditional update makes a code single-use even under a race.
        claimed = step is not None and await query_one(
            """
            UPDATE users SET totp_last_step = $2
            WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2)
            RETURNING id
            """,
            user_id, step,
        )
        if not claimed:
            await _record_failure(user_id, ip, "code")
            raise SimpleError("That code is wrong or was already used", 401)

    tokens = await admin_2fa.issue_admin_tokens(user_id, user["email"])
    await log_action(
        admin_id=user_id, action="admin.sign_in", target_type="user",
        target_id=user_id, ip_address=ip,
    )
    fire_and_forget(
        email_service.send_login_alert_email(
            user["email"], user.get("name") or "", ip,
            request.headers.get("user-agent") or "Unknown", datetime.now(UTC),
        )
    )
    return jsjson({**tokens, "user": {"id": user_id, "email": user["email"], "role": user["role"]}})


def _failures(user_id: str) -> int:
    ends_at, count = _code_failures.get(user_id, (0.0, 0))
    return count if ends_at > time.monotonic() else 0


async def _record_failure(user_id: str, ip: str, reason: str) -> None:
    now = time.monotonic()
    ends_at, count = _code_failures.get(user_id, (0.0, 0))
    if ends_at <= now:
        ends_at, count = now + CODE_FAILURE_WINDOW_SECONDS, 0
    _code_failures[user_id] = (ends_at, count + 1)
    await log_action(
        admin_id=user_id, action="admin.sign_in_failed", target_type="user",
        target_id=user_id, details={"reason": reason}, ip_address=ip,
    )


@router.post("/refresh")
async def refresh(request: Request):
    check_proxy_secret(request)
    body = await _body(request)
    token = str(body.get("refreshToken") or "")
    claims = admin_2fa.read_admin_refresh(token)
    if not claims or not await token_store.has_refresh_token(token):
        raise SimpleError("Your admin session has ended. Sign in again.", 401)
    await token_store.remove_refresh_token(token)

    user = await find_by_id(claims["userId"])
    if not _is_admin(user):
        raise SimpleError("Admin access required", 403)

    started = datetime.fromtimestamp(int(claims.get("sessionStarted") or 0), UTC)
    tokens = await admin_2fa.issue_admin_tokens(str(user["id"]), user["email"], started)
    return jsjson(tokens)


@router.post("/logout")
async def logout(request: Request):
    check_proxy_secret(request)
    body = await _body(request)
    token = str(body.get("refreshToken") or "")
    if token:
        await token_store.remove_refresh_token(token)
    return jsjson({"ok": True})
