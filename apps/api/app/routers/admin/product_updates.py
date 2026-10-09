"""Product update emails (Settings → Notifications → Product updates).

Users opt in (the setting is off by default); an admin writes the update in the
admin app and sends it to everyone opted in, after a test send to themselves.
The send runs in the background and its count is in the audit log.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ...db import query, query_one
from ...errors import SimpleError
from ...json_response import jsjson
from ...logging import create_logger
from ...middleware.admin_auth import AdminUser, admin_auth
from ...services.audit_service import log_action
from ...services.email_service import send_product_update_email
from ._util import client_ip, fire_and_forget

log = create_logger("Admin:ProductUpdates")

router = APIRouter()

MAX_SUBJECT = 150
MAX_MESSAGE = 10_000

SUBSCRIBERS_WHERE = """
WHERE COALESCE(role, 'user') <> 'suspended'
  AND restricted_at IS NULL
  AND COALESCE((preferences->'notifications'->>'productUpdates')::boolean, false)
"""


async def _send_all(subject: str, message: str) -> None:
    sent = failed = 0
    for user in await query(f"SELECT email, name FROM users {SUBSCRIBERS_WHERE}"):
        try:
            await send_product_update_email(user["email"], user["name"], subject, message)
            sent += 1
        except Exception as exc:  # noqa: BLE001 — keep going for everyone else
            failed += 1
            log.error(f"Product update to {user['email']} failed: {exc}")
    log.info(f'Product update "{subject}" sent to {sent} users ({failed} failed)')


@router.get("")
@router.get("/")
async def subscribers():
    row = await query_one(f"SELECT COUNT(*)::int AS count FROM users {SUBSCRIBERS_WHERE}")
    return jsjson({"subscribers": int((row or {}).get("count") or 0)})


@router.post("")
@router.post("/")
async def send(request: Request, admin: AdminUser = Depends(admin_auth)):
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    subject = str(body.get("subject") or "").strip()
    message = str(body.get("message") or "").strip()
    if not subject or not message:
        raise SimpleError("Subject and message are required", 400)
    if len(subject) > MAX_SUBJECT or len(message) > MAX_MESSAGE:
        raise SimpleError(
            f"Keep the subject under {MAX_SUBJECT} and the message under {MAX_MESSAGE} characters",
            400,
        )

    if body.get("test"):
        me = await query_one("SELECT email, name FROM users WHERE id = $1", admin.user_id)
        if not me:
            raise SimpleError("Admin account not found", 404)
        try:
            await send_product_update_email(me["email"], me["name"], subject, message)
        except Exception as exc:  # noqa: BLE001 — tell the admin why
            raise SimpleError(f"Test email failed: {exc}", 502) from None
        return jsjson({"success": True, "test": True, "sentTo": me["email"]})

    row = await query_one(f"SELECT COUNT(*)::int AS count FROM users {SUBSCRIBERS_WHERE}")
    count = int((row or {}).get("count") or 0)
    fire_and_forget(_send_all(subject, message))
    await log_action(
        admin_id=admin.user_id,
        action="product_update.sent",
        target_type="users",
        details={"subject": subject, "recipients": count},
        ip_address=client_ip(request),
    )
    return jsjson({"success": True, "recipients": count})
