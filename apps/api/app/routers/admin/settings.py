"""Admin runtime settings — port of `routes/admin/settings.ts` (2 handlers)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ...db import query
from ...errors import SimpleError
from ...json_response import jsjson
from ...logging import create_logger
from ...middleware.admin_auth import AdminUser, admin_auth
from ...services.audit_service import log_action
from ...services.settings_service import set_setting
from ...validators.admin import update_setting_schema
from ._util import client_ip

log = create_logger("Admin:Settings")

router = APIRouter()


@router.get("")
@router.get("/")
async def list_settings():
    try:
        rows = await query(
            "SELECT key, value, updated_at FROM system_settings ORDER BY key"
        )
        return jsjson({"settings": rows})
    except Exception as exc:  # noqa: BLE001
        log.error(f"Settings list error: {exc}")
        raise SimpleError("Failed to load settings", 500) from None


@router.put("/{key}")
async def update_setting(
    key: str, request: Request, admin: AdminUser = Depends(admin_auth)
):
    try:
        body = await _json_body(request)
        data, issues = update_setting_schema(body)
        if issues:
            # The route returns only the first message, not the issue array.
            raise SimpleError(issues[0]["message"], 400)

        value = data["value"]
        await set_setting(key, value, admin.user_id)

        await log_action(
            admin_id=admin.user_id,
            action="settings.update",
            target_type="setting",
            details={"key": key, "value": value},
            ip_address=client_ip(request),
        )

        return jsjson({"message": "Setting updated", "key": key, "value": value})
    except SimpleError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error(f"Setting update error: {exc}")
        raise SimpleError("Failed to update setting", 500) from None


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}
