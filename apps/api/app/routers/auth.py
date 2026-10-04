"""Auth routes — port of `routes/auth.ts`.

Status codes, response bodies, and the generic no-enumeration replies are
reproduced exactly, including the `avatar_url` DiceBear fallback.

OAuth (`/github`, `/google` and their callbacks) is ported here as well. Every
redirect goes through `redirect_guard.redirect_to`, which enforces the same
allowlist as Express's monkey-patched `res.redirect`.
"""

from __future__ import annotations

import asyncio
import base64
import re
import secrets
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

import bcrypt
import httpx
import jwt
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict

from .. import cache
from ..config import get_settings
from ..errors import PayloadError, SimpleError
from ..json_response import jsjson
from ..logging import create_logger
from ..middleware.auth import AuthUser, bearer_token, require_auth
from ..middleware.rate_limit import get_client_ip
from ..middleware.redirect_guard import redirect_to
from ..middleware.settings_gate import registration_gate
from ..schemas.auth import (
    ForgotPasswordSchema,
    LoginSchema,
    RegisterSchema,
    ResetPasswordSchema,
)
from ..security import get_jwt_refresh_secret, get_jwt_secret
from ..services import email_service, token_store, user_service

log = create_logger("Auth")

router = APIRouter()

# ── Constants (mirroring `routes/auth.ts`) ───────────────────────────────────
BCRYPT_ROUNDS = 12
# bcryptjs silently truncates at 72 bytes; truncating here keeps hashes
# verifiable in both directions during the migration.
BCRYPT_MAX_BYTES = 72

RESET_RATE_LIMIT_MAX = 3
RESET_RATE_LIMIT_WINDOW_SECONDS = 60 * 60
RESET_TOKEN_TTL_SECONDS = 60 * 60
RESET_TOKEN_BYTES = 32  # -> 64 hex chars, matching crypto.randomBytes(32).toString('hex')

MAX_AVATAR_BYTES = 2 * 1024 * 1024

AVATAR_DATA_URL_RE = re.compile(r"^data:image/(png|jpe?g|gif|webp);base64,(.+)$", re.DOTALL)

DICEBEAR_TEMPLATE = (
    "https://api.dicebear.com/9.x/initials/svg"
    "?seed={seed}&backgroundColor=000000&textColor=f4f5f6"
)

# In-memory fallbacks used when Redis is unavailable (as in the TS implementation)
_memory_rate_limit: dict[str, dict[str, float]] = {}
_memory_reset_tokens: dict[str, dict[str, Any]] = {}

# Strong references to background tasks so they are not garbage collected.
_background_tasks: set[asyncio.Task] = set()


def _fire_and_forget(coro, label: str) -> None:
    """Run a side effect without blocking the response, logging any failure.

    Equivalent to Express's `sendX(...).catch(err => log.warn(...))`.
    """

    async def runner() -> None:
        try:
            await coro
        except Exception as exc:
            log.warning(f"{label} failed: {exc}")

    task = asyncio.create_task(runner())
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


# ── Credentials ──────────────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")[:BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(raw, bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8")[:BCRYPT_MAX_BYTES], hashed.encode("utf-8")
        )
    except Exception:
        return False


async def generate_tokens(user_id: str, email: str) -> dict[str, str]:
    """Issue an access/refresh pair with the exact claims the Express API uses.

    ``user_id`` is coerced to ``str``: asyncpg returns UUID columns as
    ``uuid.UUID``, which PyJWT's JSON encoding cannot serialise (node-postgres
    returned plain strings, so the Express tokens carried a string id).
    """
    settings = get_settings()
    issued_at = datetime.now(UTC)
    user_id = str(user_id)

    access_token = jwt.encode(
        {
            "userId": user_id,
            "email": email,
            "iat": issued_at,
            "exp": issued_at + timedelta(seconds=settings.access_token_seconds),
        },
        get_jwt_secret(),
        algorithm="HS256",
    )
    refresh_token = jwt.encode(
        {
            "userId": user_id,
            "email": email,
            "iat": issued_at,
            "exp": issued_at + timedelta(seconds=settings.refresh_token_seconds),
        },
        get_jwt_refresh_secret(),
        algorithm="HS256",
    )

    await token_store.store_refresh_token(refresh_token)
    return {"accessToken": access_token, "refreshToken": refresh_token}


def _avatar_fallback(name: str) -> str:
    # `quote` with this safe set matches JS `encodeURIComponent`
    return DICEBEAR_TEMPLATE.format(seed=quote(name or "U", safe="-_.!~*'()"))


def _user_summary(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "subscription": user["subscription"],
    }


# ── Password reset rate limiting ─────────────────────────────────────────────


async def _is_reset_rate_limited(email: str) -> bool:
    key = f"pwd-reset-rl:{email.lower()}"

    current = await cache.get(key)
    if current is not None:
        if current >= RESET_RATE_LIMIT_MAX:
            return True
        await cache.set(key, current + 1, RESET_RATE_LIMIT_WINDOW_SECONDS)
        return False

    # Fallback: in-memory (used when Redis is unavailable)
    now = time.time()
    entry = _memory_rate_limit.get(key)
    if entry and entry["expires_at"] > now:
        if entry["count"] >= RESET_RATE_LIMIT_MAX:
            return True
        entry["count"] += 1
        return False

    await cache.set(key, 1, RESET_RATE_LIMIT_WINDOW_SECONDS)
    _memory_rate_limit[key] = {
        "count": 1,
        "expires_at": now + RESET_RATE_LIMIT_WINDOW_SECONDS,
    }
    return False


# ── Routes ───────────────────────────────────────────────────────────────────


@router.post("/register")
async def register(payload: RegisterSchema, _gate: None = Depends(registration_gate)):
    existing = await user_service.find_by_email(payload.email)
    if existing:
        raise SimpleError("Email already registered", 400)

    try:
        user = await user_service.create_user(
            payload.email, hash_password(payload.password), payload.name
        )
        if not user:
            raise SimpleError("Registration failed", 500)

        tokens = await generate_tokens(user["id"], user["email"])
        _fire_and_forget(
            email_service.send_welcome_email(user["email"], user["name"]), "Welcome email"
        )
        return jsjson({"user": _user_summary(user), **tokens}, 201)
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Register error: {exc}")
        raise SimpleError("Registration failed", 500) from None


@router.post("/login")
async def login(payload: LoginSchema, request: Request):
    try:
        user = await user_service.find_by_email(payload.email)
        if not user or not user.get("password"):
            raise SimpleError(
                "Invalid credentials. Please use your social login provider"
                " if you registered via one.",
                401,
            )

        if not verify_password(payload.password, user["password"]):
            raise SimpleError("Invalid credentials", 401)

        tokens = await generate_tokens(user["id"], user["email"])

        ip = get_client_ip(request)
        user_agent = request.headers.get("user-agent") or "Unknown"
        _fire_and_forget(
            email_service.send_login_alert_email(
                user["email"], user["name"], ip, user_agent, datetime.now(UTC)
            ),
            "Login alert email",
        )

        return jsjson({"user": _user_summary(user), **tokens})
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Login error: {exc}")
        raise SimpleError("Login failed", 500) from None


@router.post("/refresh")
async def refresh(request: Request):
    # `routes/auth.ts` reads `req.body.refreshToken` directly rather than running
    # it through `refreshSchema`, so a missing token yields 401 with this message
    # instead of a 400 validation error. The validator exists in the TS source
    # but is never called.
    try:
        body = await request.json()
    except Exception:
        body = {}
    token = body.get("refreshToken") if isinstance(body, dict) else None

    if not token or not await token_store.has_refresh_token(token):
        raise SimpleError("Invalid refresh token", 401)

    try:
        decoded = jwt.decode(token, get_jwt_refresh_secret(), algorithms=["HS256"])
    except Exception:
        raise SimpleError("Invalid refresh token", 401) from None

    # Rotate: remove the old token, issue a new pair
    await token_store.remove_refresh_token(token)
    tokens = await generate_tokens(decoded["userId"], decoded["email"])
    return jsjson(tokens)


@router.post("/logout")
async def logout(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    refresh_token = body.get("refreshToken") if isinstance(body, dict) else None

    if refresh_token:
        await token_store.remove_refresh_token(refresh_token)

    # Blacklist the current access token for its remaining lifetime
    token = bearer_token(request)
    if token:
        try:
            # Express uses jwt.decode here — signature is intentionally not verified
            decoded = jwt.decode(token, options={"verify_signature": False})
            exp = decoded.get("exp")
            if exp:
                ttl = int(exp) - int(time.time())
                if ttl > 0:
                    await cache.set(f"bl:{token}", "1", ttl)
        except Exception:
            pass  # ignore decode errors on logout

    return jsjson({"message": "Logged out successfully"})


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordSchema):
    normalized_email = payload.email.lower()
    generic_response = {
        "message": "If that email is registered, a reset link has been sent."
    }

    if await _is_reset_rate_limited(normalized_email):
        log.warning(f"Password reset rate limit exceeded for {normalized_email}")
        raise SimpleError(
            "Too many password reset requests. Please try again later.", 429
        )

    user = await user_service.find_by_email(normalized_email)
    if not user:
        # Never reveal whether the address exists
        return jsjson(generic_response)

    reset_token = secrets.token_hex(RESET_TOKEN_BYTES)
    await cache.set(
        f"pwd-reset-token:{reset_token}", user["id"], RESET_TOKEN_TTL_SECONDS
    )
    _memory_reset_tokens[reset_token] = {
        "user_id": user["id"],
        "expires_at": time.time() + RESET_TOKEN_TTL_SECONDS,
    }

    frontend_url = get_settings().FRONTEND_URL or "http://localhost:3000"
    reset_link = f"{frontend_url}/reset-password?token={reset_token}"

    await email_service.send_password_reset_email(user["email"], reset_link)
    log.info(f"Password reset email sent to {normalized_email}")
    return jsjson(generic_response)


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordSchema, request: Request):
    token_key = f"pwd-reset-token:{payload.token}"

    user_id = await cache.get(token_key)
    if not user_id:
        entry = _memory_reset_tokens.get(payload.token)
        if entry and entry["expires_at"] > time.time():
            user_id = entry["user_id"]

    if not user_id:
        raise SimpleError("Invalid or expired reset token", 400)

    await user_service.update_password(user_id, hash_password(payload.password))

    # Invalidate so the token cannot be reused
    await cache.delete(token_key)
    _memory_reset_tokens.pop(payload.token, None)

    user = await user_service.find_by_id(user_id)
    if user:
        _fire_and_forget(
            email_service.send_password_changed_email(
                user["email"], user["name"], get_client_ip(request)
            ),
            "Password changed email",
        )

    log.info(f"Password reset completed for user {user_id}")
    return jsjson({"message": "Password has been reset successfully"})


@router.get("/me")
async def get_me(user: AuthUser = Depends(require_auth)):
    row = await user_service.find_by_id(user.user_id)
    if not row:
        raise SimpleError("User not found", 404)

    return jsjson(
        {
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "subscription": row["subscription"],
            "preferences": row["preferences"] or {},
            "auth_provider": row["auth_provider"] or "email",
            "avatar_url": row["avatar_url"] or _avatar_fallback(row["name"]),
            "company": row["company"] or None,
            "job_title": row["job_title"] or None,
            "website": row["website"] or None,
            "phone": row["phone"] or None,
            "country": row["country"] or None,
            "timezone": row["timezone"] or None,
            "createdAt": row["created_at"],
        }
    )


@router.patch("/me")
async def update_me(body: dict[str, Any], user: AuthUser = Depends(require_auth)):
    try:
        preferences = body.get("preferences")
        if preferences and isinstance(preferences, dict):
            await user_service.update_preferences(user.user_id, preferences)

        profile_fields = {
            key: body[key]
            for key in (
                "name",
                "company",
                "job_title",
                "website",
                "phone",
                "country",
                "timezone",
            )
            if key in body
        }
        if profile_fields:
            await user_service.update_profile(user.user_id, profile_fields)

        row = await user_service.find_by_id(user.user_id)
        if not row:
            raise SimpleError("User not found", 404)

        return jsjson(
            {
                "id": row["id"],
                "name": row["name"],
                "email": row["email"],
                "avatar_url": row["avatar_url"] or _avatar_fallback(row["name"]),
                "company": row["company"],
                "job_title": row["job_title"],
                "website": row["website"],
                "phone": row["phone"],
                "country": row["country"],
                "timezone": row["timezone"],
                "preferences": row["preferences"],
            }
        )
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Update profile error: {exc}")
        raise SimpleError("Failed to update profile", 500) from None


class _AvatarBody(BaseModel):
    image: str | None = None

    model_config = ConfigDict(extra="ignore")


@router.post("/avatar")
async def upload_avatar(
    body: _AvatarBody, user: AuthUser = Depends(require_auth)
):
    try:
        image = body.image
        if not image or not isinstance(image, str):
            raise SimpleError("Image data required", 400)

        match = AVATAR_DATA_URL_RE.match(image)
        if not match:
            raise SimpleError(
                "Invalid image format. Use PNG, JPEG, GIF, or WebP.", 400
            )

        extension = "jpg" if match.group(1) == "jpeg" else match.group(1)
        data = base64.b64decode(match.group(2))

        if len(data) > MAX_AVATAR_BYTES:
            raise SimpleError("Image must be under 2MB", 400)

        upload_dir = Path.cwd() / "uploads" / "avatars"
        upload_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{user.user_id}.{extension}"
        (upload_dir / filename).write_bytes(data)

        avatar_url = f"/uploads/avatars/{filename}"
        await user_service.update_avatar(user.user_id, avatar_url)

        return jsjson({"avatar_url": avatar_url})
    except SimpleError:
        raise
    except Exception as exc:
        log.error(f"Avatar upload error: {exc}")
        raise SimpleError("Failed to upload avatar", 500) from None


@router.delete("/avatar")
async def delete_avatar(user: AuthUser = Depends(require_auth)):
    try:
        await user_service.update_avatar(user.user_id, None)
        row = await user_service.find_by_id(user.user_id)
        return jsjson({"avatar_url": _avatar_fallback((row or {}).get("name") or "U")})
    except Exception as exc:
        log.error(f"Avatar delete error: {exc}")
        raise SimpleError("Failed to remove avatar", 500) from None


# ── OAuth ────────────────────────────────────────────────────────────────────


async def _find_or_create_oauth_user(
    email: str,
    name: str,
    provider: str,
    provider_id: str,
    avatar_url: str | None,
) -> dict[str, Any] | None:
    """Match on provider id, else link to an existing email, else create."""
    user = await user_service.find_by_oauth_id(provider, provider_id)
    if user:
        return user

    existing = await user_service.find_by_email(email)
    if existing:
        return await user_service.link_oauth(
            existing["id"], provider, provider_id, avatar_url
        )

    user = await user_service.create_oauth_user(
        email, name, provider, provider_id, avatar_url
    )
    if user:
        _fire_and_forget(
            email_service.send_welcome_email(email, name), "Welcome email"
        )
    return user


def _frontend_redirect(path: str):
    """Redirect to the customer frontend.

    `FRONTEND_URL`'s host must appear in `CORS_ORIGIN`, otherwise the redirect
    guard rejects it — the same constraint Express has.
    """
    frontend_url = get_settings().FRONTEND_URL or "http://localhost:3000"
    return redirect_to(f"{frontend_url}{path}")


def _callback_redirect(tokens: dict[str, str]):
    params = urlencode(
        {"accessToken": tokens["accessToken"], "refreshToken": tokens["refreshToken"]}
    )
    return _frontend_redirect(f"/auth/callback?{params}")


# ── OAuth: GitHub ────────────────────────────────────────────────────────────


@router.get("/github")
async def github_authorize():
    client_id = get_settings().GITHUB_CLIENT_ID or ""
    if not client_id:
        raise SimpleError("GitHub OAuth not configured", 503)

    redirect_uri = f"{get_settings().oauth_api_url}/api/auth/github/callback"
    scope = "read:user user:email"
    url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={quote(redirect_uri, safe='')}"
        f"&scope={quote(scope, safe='')}"
    )
    return redirect_to(url)


@router.get("/github/callback")
async def github_callback(code: str | None = None):
    settings = get_settings()

    try:
        if not code:
            return _frontend_redirect("/login?error=missing_code")

        async with httpx.AsyncClient(timeout=20) as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json={
                    "client_id": settings.GITHUB_CLIENT_ID or "",
                    "client_secret": settings.GITHUB_CLIENT_SECRET or "",
                    "code": code,
                },
            )
            token_data = token_response.json()
            access_token = token_data.get("access_token")

            if not access_token:
                log.error(f"GitHub OAuth token exchange failed: {token_data}")
                return _frontend_redirect("/login?error=oauth_failed")

            auth_headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            }
            profile_response, emails_response = await asyncio.gather(
                client.get("https://api.github.com/user", headers=auth_headers),
                client.get("https://api.github.com/user/emails", headers=auth_headers),
            )
            profile = profile_response.json()
            emails = emails_response.json()

        primary_email = None
        if isinstance(emails, list) and emails:
            verified = next(
                (e for e in emails if e.get("primary") and e.get("verified")), None
            )
            primary_email = (verified or {}).get("email") or emails[0].get("email")
        primary_email = primary_email or profile.get("email")

        if not primary_email:
            return _frontend_redirect("/login?error=no_email")

        github_id = str(profile.get("id"))
        name = profile.get("name") or profile.get("login") or "GitHub User"

        user = await _find_or_create_oauth_user(
            primary_email, name, "github", github_id, profile.get("avatar_url")
        )
        if not user:
            return _frontend_redirect("/login?error=account_creation_failed")

        return _callback_redirect(await generate_tokens(user["id"], user["email"]))

    except PayloadError:
        raise
    except Exception as exc:
        log.error(f"GitHub OAuth callback error: {exc}")
        return _frontend_redirect("/login?error=oauth_error")


# ── OAuth: Google ────────────────────────────────────────────────────────────


@router.get("/google")
async def google_authorize():
    client_id = get_settings().GOOGLE_CLIENT_ID or ""
    if not client_id:
        raise SimpleError("Google OAuth not configured", 503)

    redirect_uri = f"{get_settings().oauth_api_url}/api/auth/google/callback"
    scope = "openid email profile"
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={quote(redirect_uri, safe='')}"
        "&response_type=code"
        f"&scope={quote(scope, safe='')}"
        "&access_type=offline"
        "&prompt=consent"
    )
    return redirect_to(url)


@router.get("/google/callback")
async def google_callback(code: str | None = None):
    settings = get_settings()

    try:
        if not code:
            return _frontend_redirect("/login?error=missing_code")

        redirect_uri = f"{settings.oauth_api_url}/api/auth/google/callback"

        async with httpx.AsyncClient(timeout=20) as client:
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                content=urlencode(
                    {
                        "code": code,
                        "client_id": settings.GOOGLE_CLIENT_ID or "",
                        "client_secret": settings.GOOGLE_CLIENT_SECRET or "",
                        "redirect_uri": redirect_uri,
                        "grant_type": "authorization_code",
                    }
                ),
            )
            token_data = token_response.json()
            access_token = token_data.get("access_token")

            if not access_token:
                log.error(f"Google OAuth token exchange failed: {token_data}")
                return _frontend_redirect("/login?error=oauth_failed")

            profile_response = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            profile = profile_response.json()

        if not profile.get("email"):
            return _frontend_redirect("/login?error=no_email")

        google_id = str(profile.get("id"))
        name = profile.get("name") or "Google User"

        user = await _find_or_create_oauth_user(
            profile["email"], name, "google", google_id, profile.get("picture")
        )
        if not user:
            return _frontend_redirect("/login?error=account_creation_failed")

        return _callback_redirect(await generate_tokens(user["id"], user["email"]))

    except PayloadError:
        raise
    except Exception as exc:
        log.error(f"Google OAuth callback error: {exc}")
        return _frontend_redirect("/login?error=oauth_error")
