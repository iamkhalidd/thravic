"""Admin audit log — port of `routes/admin/audit.ts` (1 handler)."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ...errors import SimpleError
from ...js_compat import js_parse_int
from ...json_response import jsjson
from ...logging import create_logger
from ...services.audit_service import get_audit_log

log = create_logger("Admin:Audit")

router = APIRouter()


@router.get("")
@router.get("/")
async def list_audit(request: Request):
    try:
        params = request.query_params

        result = await get_audit_log(
            admin_id=params.get("adminId") or None,
            action=params.get("action") or None,
            target_type=params.get("targetType") or None,
            # `parseInt(x || '50')` then `options.limit || 50`, so a malformed or
            # zero limit falls back to 50 rather than reaching SQL.
            limit=js_parse_int(params.get("limit") or "50"),
            offset=js_parse_int(params.get("offset") or "0"),
        )

        return jsjson(result)
    except Exception as exc:  # noqa: BLE001
        log.error(f"Audit log error: {exc}")
        raise SimpleError("Failed to load audit log", 500) from None
