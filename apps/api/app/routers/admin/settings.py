"""Admin runtime settings — port of `routes/admin/settings.ts` (2 handlers).

The list says who changed each setting last. Flipping one of the big switches
(sign-ups, event collection, maintenance) also emails the owner, so a change
nobody expected is seen within minutes, not when customers complain.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ...db import query, query_one
from ...errors import SimpleError
from ...json_response import jsjson
from ...logging import create_logger
from ...middleware.admin_auth import AdminUser, admin_auth
from ...services import email_service
from ...services.audit_service import log_action
from ...services.settings_service import set_setting
from ...validators.admin import update_setting_schema
from ._util import client_ip

log = create_logger("Admin:Settings")

router = APIRouter()

# key -> (name in the email, what "on" means, what "off" means)
CRITICAL_SWITCHES = {
    "registration.enabled": ("Sign-ups", "New people can create accounts.",
                             "Nobody new can create an account."),
    "tracking.enabled": ("Event collection", "Events from customer sites are accepted.",
                         "Events from every customer site are being dropped."),
    "maintenance.enabled": ("Maintenance mode", "Customers see a maintenance notice.",
                            "Thravic is open to customers again."),
}


@router.get("")
@router.get("/")
async def list_settings():
    try:
        rows = await query(
            """
            SELECT s.key, s.value, s.updated_at,
                   COALESCE(NULLIF(u.name, ''), u.email) AS updated_by_name
            FROM system_settings s
            LEFT JOIN users u ON u.id = s.updated_by
            ORDER BY s.key
            """
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
        before = await query_one("SELECT value FROM system_settings WHERE key = $1", key)
        await set_setting(key, value, admin.user_id)
        if key in CRITICAL_SWITCHES and _is_on((before or {}).get("value")) != _is_on(value):
            await _alert_switch(key, _is_on(value), admin, client_ip(request))

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


def _is_on(value: object) -> bool:
    return value is True or value == "true"


async def _alert_switch(key: str, on: bool, admin: AdminUser, ip: str | None) -> None:
    label, on_text, off_text = CRITICAL_SWITCHES[key]
    state = "on" if on else "off"
    try:
        await email_service.send_owner_system_alert(
            f"{label} was turned {state}",
            f"{label} is now {state}",
            [
                ("What this means", on_text if on else off_text),
                ("Changed by", admin.email or admin.user_id),
                ("From IP", ip or "unknown"),
            ],
        )
    except Exception as exc:  # noqa: BLE001 - the switch already changed
        log.error(f"Switch alert for {key} failed: {exc}")


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}
