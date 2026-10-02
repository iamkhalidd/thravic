"""Application errors — mirrors the Express `AppError` class and its factories."""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Error carrying an HTTP status, a stable error code and optional details."""

    def __init__(
        self,
        message: str,
        status_code: int = 500,
        code: str = "INTERNAL_ERROR",
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details
        self.is_operational = True

    # ── Factory methods (same names and defaults as the TS class) ──

    @classmethod
    def bad_request(cls, message: str, details: Any = None) -> AppError:
        return cls(message, 400, "BAD_REQUEST", details)

    @classmethod
    def unauthorized(cls, message: str = "Unauthorized") -> AppError:
        return cls(message, 401, "UNAUTHORIZED")

    @classmethod
    def forbidden(cls, message: str = "Forbidden") -> AppError:
        return cls(message, 403, "FORBIDDEN")

    @classmethod
    def not_found(cls, resource: str = "Resource") -> AppError:
        return cls(f"{resource} not found", 404, "NOT_FOUND")

    @classmethod
    def conflict(cls, message: str) -> AppError:
        return cls(message, 409, "CONFLICT")

    @classmethod
    def too_many_requests(cls, message: str = "Too many requests") -> AppError:
        return cls(message, 429, "TOO_MANY_REQUESTS")

    @classmethod
    def internal(cls, message: str = "Internal server error") -> AppError:
        return cls(message, 500, "INTERNAL_ERROR")


class SimpleError(Exception):
    """Error rendered as `{"error": message}` with **no** `code` field.

    The Express middleware and route handlers frequently respond directly with
    `res.status(n).json({ error })` instead of delegating to the centralized
    error handler, so those bodies carry no `code` key. `AppError` (which always
    includes one) would not match, so keep the two distinct.
    """

    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.payload: dict[str, Any] = {"error": message}


class PayloadError(Exception):
    """Error whose JSON body is supplied verbatim, with no fields added.

    Used where Express builds a bespoke body — for example the feature gate's
    403, which includes `upgrade`, `requiredPlan` and `currentPlan` alongside
    `error`.
    """

    def __init__(self, payload: dict[str, Any], status_code: int) -> None:
        super().__init__(str(payload.get("error", "")))
        self.payload = payload
        self.status_code = status_code
