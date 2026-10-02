"""Centralized error handling — port of `middleware/errorHandler.ts`.

Produces the same JSON bodies as the Express handler, including the Postgres
constraint-violation mappings (asyncpg raises typed exceptions whose `sqlstate`
matches the `err.code` values the TS handler checks).
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..errors import AppError, PayloadError, SimpleError
from ..json_response import jsjson
from ..logging import create_logger

log = create_logger("ErrorHandler")

# Postgres SQLSTATE codes the Express handler special-cases
UNIQUE_VIOLATION = "23505"
FOREIGN_KEY_VIOLATION = "23503"

# Pydantic and Zod word their built-in messages differently. Only the messages
# the API can actually surface are mapped; anything unmapped falls through and
# is reported by the parity harness, which is how these were found.
ZOD_MESSAGE_MAP = {
    "Field required": "Required",
}


def _zod_message(message: str) -> str:
    return ZOD_MESSAGE_MAP.get(message, message)


def _sqlstate(exc: BaseException) -> str | None:
    """Extract the SQLSTATE from an asyncpg error, if it is one."""
    value = getattr(exc, "sqlstate", None)
    return value if isinstance(value, str) else None


def _first_validation_message(exc: RequestValidationError) -> str:
    """Express's route-level `schema.parse()` surfaces only the first message.

    Zod returns the raw message (e.g. `"Invalid email address"`). Pydantic wraps
    messages raised from validators as `"Value error, <message>"`, so the original
    exception is read back out of `ctx` to strip that prefix.
    """
    errors = exc.errors()
    if not errors:
        return "Validation failed"

    first = errors[0]
    ctx = first.get("ctx") or {}
    original = ctx.get("error")
    if original is not None:
        return _zod_message(str(original))

    return _zod_message(first.get("msg", "Invalid value"))


def register_exception_handlers(app: FastAPI) -> None:
    """Attach handlers mirroring `errorHandler()` and the auth routes' Zod catch."""

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(_request: Request, exc: RequestValidationError):
        # Mirrors `catch (error) { if (error instanceof z.ZodError) ... }`
        # answering 400 with `errors[0].message`.
        return jsjson({"error": _first_validation_message(exc)}, 400)

    @app.exception_handler(AppError)
    async def _app_error_handler(_request: Request, exc: AppError):
        payload: dict[str, Any] = {"error": exc.message, "code": exc.code}
        if exc.details:
            payload["details"] = exc.details
        return jsjson(payload, exc.status_code)

    @app.exception_handler(SimpleError)
    async def _simple_error_handler(_request: Request, exc: SimpleError):
        # `res.status(n).json({ error })` — deliberately no `code` field
        return jsjson(exc.payload, exc.status_code)

    @app.exception_handler(PayloadError)
    async def _payload_error_handler(_request: Request, exc: PayloadError):
        # Bespoke bodies (feature gate, settings gates) passed through verbatim
        return jsjson(exc.payload, exc.status_code)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error_handler(_request: Request, exc: StarletteHTTPException):
        # Express's catch-all: res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
        if exc.status_code == 404:
            return jsjson({"error": "Not found", "code": "NOT_FOUND"}, 404)

        detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return jsjson({"error": detail}, exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled_handler(_request: Request, exc: Exception):
        state = _sqlstate(exc)

        if state == UNIQUE_VIOLATION:
            return jsjson({"error": "Resource already exists", "code": "CONFLICT"}, 409)
        if state == FOREIGN_KEY_VIOLATION:
            return jsjson(
                {"error": "Referenced resource does not exist", "code": "FK_VIOLATION"}, 400
            )

        log.error(f"Unhandled error: {exc}", exc_info=exc)

        from ..config import get_settings

        message = str(exc) if not get_settings().is_production else "Internal server error"
        return jsjson({"error": message, "code": "INTERNAL_ERROR"}, 500)
