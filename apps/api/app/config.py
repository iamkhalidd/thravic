"""Application settings.

Environment variable names deliberately mirror the Express backend one-for-one,
so a single deployment environment can serve either implementation during the
migration and the JWT secrets stay interchangeable.
"""

from __future__ import annotations

import re
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

_DURATION_RE = re.compile(r"^(\d+)\s*([smhd])?$", re.IGNORECASE)
_UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def parse_duration(value: str | int) -> int:
    """Convert a `jsonwebtoken`-style duration (`"15m"`, `"7d"`, `"900"`) to seconds.

    Mirrors the duration strings accepted by `jsonwebtoken`, so
    `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` keep identical semantics.
    """
    if isinstance(value, int):
        return value

    match = _DURATION_RE.match(value.strip())
    if not match:
        raise ValueError(f"Invalid duration: {value!r} (expected e.g. '15m', '7d', '3600')")

    amount = int(match.group(1))
    unit = (match.group(2) or "s").lower()
    return amount * _UNIT_SECONDS[unit]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Runtime ───────────────────────────────
    NODE_ENV: str = "development"
    PORT: int = 3001
    LOG_LEVEL: str = "info"
    # Serve Swagger UI at /docs (and /openapi.json). Enabled by default; set
    # DOCS_ENABLED=false to hide the docs.
    DOCS_ENABLED: bool = True

    # ── Database / cache ──────────────────────
    DATABASE_URL: str | None = None
    REDIS_URL: str | None = None

    # ── Auth ──────────────────────────────────
    JWT_SECRET: str = "default-secret"
    JWT_REFRESH_SECRET: str = "default-refresh-secret"
    JWT_EXPIRES_IN: str = "15m"
    JWT_REFRESH_EXPIRES_IN: str = "7d"

    # ── Origins ───────────────────────────────
    CORS_ORIGIN: str = "http://localhost:3000,http://localhost:3002"
    FRONTEND_URL: str = "http://localhost:3000"
    SERVER_URL: str | None = None
    API_URL: str | None = None
    RENDER_EXTERNAL_URL: str | None = None

    # ── Data retention job ────────────────────
    # dry_run (default): report daily what is past each plan's retention, delete
    # nothing. delete: remove it. off: do not run. See jobs/retention.py.
    RETENTION_MODE: str = "dry_run"

    # ── Rate limiting ─────────────────────────
    RATE_LIMIT_WINDOW_MS: int = 900_000
    RATE_LIMIT_MAX: int = 300

    # ── Demo mode ─────────────────────────────
    DEMO_MODE: str = "false"

    # ── Billing / email / OAuth ───────────────
    PAYSTACK_SECRET_KEY: str | None = None
    PAYSTACK_WEBHOOK_SECRET: str | None = None
    RESEND_API_KEY: str | None = None
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASS: str | None = None
    SMTP_FROM: str = "Thravic <onboarding@resend.dev>"
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GITHUB_CLIENT_ID: str | None = None
    GITHUB_CLIENT_SECRET: str | None = None
    GEMINI_API_KEY: str | None = None

    # ── Parity harness ────────────────────────
    EXPRESS_BASE_URL: str = "http://localhost:3001"
    FASTAPI_BASE_URL: str = "http://localhost:8000"

    # ── Derived ───────────────────────────────

    @property
    def is_production(self) -> bool:
        return self.NODE_ENV == "production"

    @property
    def demo_enabled(self) -> bool:
        return self.DEMO_MODE == "true"

    @property
    def allowed_origins(self) -> list[str]:
        """Comma-separated `CORS_ORIGIN`, parsed once — mirrors `index.ts`."""
        return [origin.strip() for origin in self.CORS_ORIGIN.split(",") if origin.strip()]

    @property
    def api_public_url(self) -> str:
        """Public URL of this API — mirrors the `SERVER_URL || API_URL` fallback chain."""
        return self.SERVER_URL or self.API_URL or self.RENDER_EXTERNAL_URL or ""

    @property
    def oauth_api_url(self) -> str:
        """Base URL used to build OAuth `redirect_uri` values.

        Note this deliberately omits `SERVER_URL`, because `routes/auth.ts` uses
        `API_URL || RENDER_EXTERNAL_URL` — unlike `routes/domains.ts` and the
        tracker route, which prefer `SERVER_URL`. Both chains are reproduced.
        """
        return self.API_URL or self.RENDER_EXTERNAL_URL or "http://localhost:3001"

    @property
    def access_token_seconds(self) -> int:
        return parse_duration(self.JWT_EXPIRES_IN)

    @property
    def refresh_token_seconds(self) -> int:
        return parse_duration(self.JWT_REFRESH_EXPIRES_IN)


@lru_cache
def get_settings() -> Settings:
    return Settings()
