"""Security configuration — port of `config/security.ts`.

Fails fast in production when a secret is missing or left at an insecure default.
"""

from __future__ import annotations

from .config import get_settings
from .errors import AppError
from .logging import create_logger

log = create_logger("Security")

INSECURE_DEFAULTS = {
    "default-secret",
    "default-refresh-secret",
    "your-secret-key",
    "change-me",
    "change-me-to-a-long-random-string",
    "change-me-to-a-different-long-random-string",
}


def get_jwt_secret() -> str:
    return get_settings().JWT_SECRET or "default-secret"


def get_jwt_refresh_secret() -> str:
    return get_settings().JWT_REFRESH_SECRET or "default-refresh-secret"


def validate_security_config() -> None:
    """Log warnings in development; raise in production when config is insecure."""
    settings = get_settings()
    issues: list[str] = []

    if not settings.JWT_SECRET or settings.JWT_SECRET in INSECURE_DEFAULTS:
        issues.append("JWT_SECRET is not set or uses an insecure default")
    if not settings.JWT_REFRESH_SECRET or settings.JWT_REFRESH_SECRET in INSECURE_DEFAULTS:
        issues.append("JWT_REFRESH_SECRET is not set or uses an insecure default")
    if not settings.DATABASE_URL:
        issues.append("DATABASE_URL is not set")
    if settings.is_production and not settings.CORS_ORIGIN:
        issues.append("CORS_ORIGIN should be explicitly set in production")

    if not issues:
        return

    message = "Security Configuration Issues: " + "; ".join(issues)
    if settings.is_production:
        log.error(message)
        raise AppError(
            "Refusing to start: security configuration is insecure for production.",
            500,
            "INSECURE_CONFIG",
            issues,
        )

    log.warning(message)


def validate_cors_origins(origins: list[str]) -> None:
    """Reject a wildcard origin in production, matching the Express startup check."""
    settings = get_settings()
    if not settings.is_production:
        return

    for origin in origins:
        if origin == "*":
            raise AppError(
                'CORS wildcard "*" is forbidden in production.',
                500,
                "INSECURE_CORS",
            )
        if not origin.startswith("https://"):
            log.warning(
                f'CORS origin "{origin}" is not HTTPS — strongly recommended for production.'
            )
