"""Auth request schemas — port of `validators/auth.ts`.

Field order matches the Zod object definitions, because both Zod and Pydantic
report the first failing field, and the Express routes return only that first
message to the client.

Messages are byte-identical to the Zod ones so error responses match exactly.
Pydantic wraps `ValueError` text as `"Value error, <message>"`; the error handler
unwraps it back to the original message.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, field_validator

from .. import profile

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

MIN_PASSWORD_LENGTH = 8
MIN_NAME_LENGTH = 2


def _validate_password(value: str) -> str:
    """Apply Zod's checks in the same order, failing on the first."""
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[A-Z]", value):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[0-9]", value):
        raise ValueError("Password must contain at least one number")
    if not re.search(r"[^A-Za-z0-9]", value):
        raise ValueError("Password must contain at least one special character")
    return value


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=False)


class RegisterSchema(_StrictModel):
    email: str
    password: str
    name: str
    # Required at sign-up (see app/profile.py); age is checked by the route.
    # Defaults are validated so a missing field gets the same friendly message.
    model_config = ConfigDict(extra="ignore", validate_default=True)

    date_of_birth: str = ""
    country: str = ""
    phone: str = ""

    @field_validator("email")
    @classmethod
    def _check_email(cls, value: str) -> str:
        if not _EMAIL_RE.match(value):
            raise ValueError("Invalid email address")
        return value

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return _validate_password(value)

    @field_validator("name")
    @classmethod
    def _check_name(cls, value: str) -> str:
        if len(value) < MIN_NAME_LENGTH:
            raise ValueError("Name must be at least 2 characters")
        return value

    @field_validator("date_of_birth")
    @classmethod
    def _check_date_of_birth(cls, value: str) -> str:
        return profile.parse_date_of_birth(value).isoformat()

    @field_validator("country")
    @classmethod
    def _check_country(cls, value: str) -> str:
        return profile.normalize_country(value)

    @field_validator("phone")
    @classmethod
    def _check_phone(cls, value: str) -> str:
        return profile.normalize_phone(value)


class LoginSchema(_StrictModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _check_email(cls, value: str) -> str:
        if not _EMAIL_RE.match(value):
            raise ValueError("Invalid email address")
        return value

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        if len(value) < 1:
            raise ValueError("Password is required")
        return value


class RefreshSchema(_StrictModel):
    """Retained for parity with `validators/auth.ts`, which also defines it.

    Neither implementation calls it: the refresh route reads `req.body` directly,
    so a missing token is a 401 rather than a 400 validation error. Do not wire
    this up without changing that behaviour deliberately.
    """

    refreshToken: str

    @field_validator("refreshToken")
    @classmethod
    def _check_token(cls, value: str) -> str:
        if len(value) < 1:
            raise ValueError("Refresh token is required")
        return value


class ForgotPasswordSchema(_StrictModel):
    email: str

    @field_validator("email")
    @classmethod
    def _check_email(cls, value: str) -> str:
        if not _EMAIL_RE.match(value):
            raise ValueError("Invalid email address")
        return value


class ResetPasswordSchema(_StrictModel):
    token: str
    password: str

    @field_validator("token")
    @classmethod
    def _check_token(cls, value: str) -> str:
        if len(value) < 1:
            raise ValueError("Reset token is required")
        return value

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return _validate_password(value)
