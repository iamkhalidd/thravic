"""Crash reports from the web dashboard and the admin panel.

The apps' error pages POST here when a page breaks in someone's browser. The
report is logged and, when SENTRY_DSN is set, sent to Sentry, so one Sentry
project sees API and browser errors together without a key in the browser.

Public and anonymous by design: it is rate limited per IP, every field is cut
to a fixed size, and nothing in the report is trusted or echoed back.
"""

from __future__ import annotations

import sentry_sdk
from fastapi import APIRouter, Request, Response

from ..logging import create_logger

log = create_logger("ClientErrors")

router = APIRouter()

MAX_BODY_BYTES = 8 * 1024
APPS = {"web", "admin"}
LIMITS = {"message": 500, "stack": 4000, "url": 500, "digest": 100, "userAgent": 300}


@router.post("")
@router.post("/")
async def report(request: Request):
    raw = await request.body()
    if len(raw) > MAX_BODY_BYTES:
        return Response(status_code=413)
    try:
        body = await request.json()
    except Exception:
        return Response(status_code=400)
    if not isinstance(body, dict):
        return Response(status_code=400)

    app = body.get("app") if body.get("app") in APPS else "unknown"
    fields = {k: str(body.get(k) or "")[:n] for k, n in LIMITS.items()}
    if not fields["message"]:
        return Response(status_code=400)

    log.warning(f"[{app}] {fields['message']} at {fields['url']}")
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("source", f"browser:{app}")
        for key, value in fields.items():
            if value and key != "message":
                scope.set_extra(key, value)
        sentry_sdk.capture_message(f"[{app}] {fields['message']}", level="error")

    return Response(status_code=204)
