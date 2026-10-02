"""Runtime settings gates — port of `middleware/settingsGate.ts`.

These let the admin settings panel actually control the server. Settings are
cached for 60s by `settings_service`, so the DB is not hit per request.

All three gates **fail open** on error, matching Express: a settings outage must
never block traffic.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ..errors import PayloadError
from ..json_response import jsjson
from ..logging import create_logger
from ..services.settings_service import is_enabled

log = create_logger("SettingsGate")

MAINTENANCE_BODY = {
    "error": "Thravic is currently under scheduled maintenance. Please try again shortly.",
    "maintenance": True,
    "code": "MAINTENANCE_MODE",
}

REGISTRATION_DISABLED_BODY = {
    "error": "Registration is currently closed. Please check back later.",
    "code": "REGISTRATION_DISABLED",
}

TRACKING_DISABLED_BODY = {
    "error": "Event collection is temporarily paused.",
    "code": "TRACKING_DISABLED",
}

CallNext = Callable[[Request], Awaitable[Response]]


def is_admin_route(path: str) -> bool:
    """Admin and health routes bypass the maintenance gate so you can turn it off."""
    return path.startswith("/api/admin") or path == "/health"


class MaintenanceModeMiddleware(BaseHTTPMiddleware):
    """Return 503 for all non-admin routes while `maintenance.enabled` is true."""

    async def dispatch(self, request: Request, call_next: CallNext) -> Response:
        if is_admin_route(request.url.path):
            return await call_next(request)

        try:
            if await is_enabled("maintenance.enabled"):
                return jsjson(MAINTENANCE_BODY, 503)
        except Exception as exc:
            # Fail open — never block requests due to settings DB errors
            log.error(f"maintenanceModeGate error: {exc}")

        return await call_next(request)


async def registration_gate() -> None:
    """Reject signups when `registration.enabled` is not true.

    Faithfully reproduces the Express logic: `isEnabled` returns `False` for a
    *missing* key, so an absent setting closes registration. `schema.sql` seeds
    it to `true`, which is why the normal path stays open.
    """
    try:
        enabled = await is_enabled("registration.enabled")
        registration_open = enabled is not False
        if not registration_open:
            raise PayloadError(REGISTRATION_DISABLED_BODY, 403)
    except PayloadError:
        raise
    except Exception as exc:
        log.error(f"registrationGate error: {exc}")


async def tracking_gate(request: Request) -> None:
    """Pause event ingestion when `tracking.enabled` is not true.

    Only writes are gated — GET/OPTIONS pass through, as in Express.
    """
    if request.method in ("GET", "OPTIONS"):
        return

    try:
        enabled = await is_enabled("tracking.enabled")
        tracking_on = enabled is not False
        if not tracking_on:
            raise PayloadError(TRACKING_DISABLED_BODY, 503)
    except PayloadError:
        raise
    except Exception as exc:
        log.error(f"trackingGate error: {exc}")
