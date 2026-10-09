"""Contact form route — port of `routes/contact.ts`.

⚠️ This endpoint sends a **real email** through Resend/SMTP on the success path.
Parity tests must only exercise the validation-failure branch.

The Express handler returns a Zod-specific error body on validation failure:
`{ error: 'Validation failed', details: <zod issues> }`. Zod's issue objects are
an implementation artifact of the library; this port emits a documented
equivalent `{ path, code, message, ... }` shape instead. The `error` field and
the 400 status — the parts a client actually acts on — match exactly.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Request

from ..errors import PayloadError
from ..json_response import jsjson
from ..logging import create_logger
from ..services.email_service import contact_form_email, send_email

log = create_logger("Route:Contact")

router = APIRouter()

RECIPIENT = "thravic247@gmail.com"

# Zod's `.email()` regex is deliberately permissive; this approximates it.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

FIELD_RULES: tuple[tuple[str, str], ...] = (
    ("name", "Name is required"),
    ("email", "Invalid email address"),
    ("type", "Inquiry type is required"),
    ("subject", "Subject is required"),
    ("message", "Message is required"),
)


def _received_type(value: object) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    return "object"


def _validate(body: dict) -> list[dict]:
    """Collect issues for every field, in declaration order, like `zod.parse`."""
    details: list[dict] = []

    for field, message in FIELD_RULES:
        value = body.get(field)

        if value is None:
            details.append(
                {
                    "code": "invalid_type",
                    "expected": "string",
                    "received": "undefined",
                    "path": [field],
                    "message": "Required",
                }
            )
            continue

        if not isinstance(value, str):
            received = _received_type(value)
            details.append(
                {
                    "code": "invalid_type",
                    "expected": "string",
                    "received": received,
                    "path": [field],
                    "message": f"Expected string, received {received}",
                }
            )
            continue

        if field == "email":
            if not EMAIL_RE.match(value):
                details.append(
                    {
                        "validation": "email",
                        "code": "invalid_string",
                        "message": message,
                        "path": [field],
                    }
                )
            continue

        if len(value) < 1:
            details.append(
                {
                    "code": "too_small",
                    "minimum": 1,
                    "type": "string",
                    "inclusive": True,
                    "exact": False,
                    "message": message,
                    "path": [field],
                }
            )

    return details


@router.post("")
@router.post("/")
async def submit(request: Request):
    try:
        try:
            body = await request.json()
        except Exception:
            body = {}

        if not isinstance(body, dict):
            body = {}

        details = _validate(body)
        if details:
            # Raised (not returned) so the body is emitted verbatim, unmodified by
            # the global validation handler.
            raise PayloadError(
                {"error": "Validation failed", "details": details}, status_code=400
            )

        data = body

        log.info(f"New contact form submission from {data['email']} ({data['type']})")

        subject, html_body, text_body = contact_form_email(data)
        await send_email(RECIPIENT, subject, html_body, text_body)

        return jsjson({"success": True, "message": "Message sent successfully"})
    except PayloadError:
        raise
    except Exception as exc:
        log.error(f"Contact form submission failed: {exc}")
        raise PayloadError(
            {"error": "Failed to send message. Please try again later."}, status_code=500
        ) from None

