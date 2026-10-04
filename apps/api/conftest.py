"""Pytest bootstrap.

Puts the project root on `sys.path` so `import app` resolves when tests are run
from the `apps/api` directory (there is no `src/` layout to do this implicitly).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


# ── Test defaults ────────────────────────────────────────────────────────────
# The suite asserts development behaviour and must never write to the real
# database. Seed safe defaults for any key the caller has not explicitly
# exported, *before* `app.config.get_settings()` is first called. `.env` values
# lose to process environment variables, so a production `.env` cannot leak in.
# Explicitly exported variables still win, so the suite can be pointed at a
# specific database (e.g. the parity harness) when needed.

_TEST_DEFAULTS = {
    "NODE_ENV": "development",
    "DATABASE_URL": "",
    "REDIS_URL": "",
    "CORS_ORIGIN": "http://localhost:3000,http://localhost:3002",
    "FRONTEND_URL": "http://localhost:3000",
    "GITHUB_CLIENT_ID": "",
    "GITHUB_CLIENT_SECRET": "",
    "GOOGLE_CLIENT_ID": "",
    "GOOGLE_CLIENT_SECRET": "",
}
for _key, _value in _TEST_DEFAULTS.items():
    os.environ.setdefault(_key, _value)


# ── Safety: the suite writes to whatever DATABASE_URL points at ───────────────
#
# Several tests exercise real routes through a TestClient, and one of them
# registers a user. With a production DATABASE_URL in `.env` that means writing
# to production — which is how a stray `a@b.com` row once appeared in the live
# database. Loopback targets are fine; anything else must be opted into.

LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", ""})
ALLOW_REMOTE_ENV = "THRAVIC_ALLOW_REMOTE_DB_TESTS"


def _database_host(dsn: str) -> str:
    from urllib.parse import urlparse

    try:
        return (urlparse(dsn).hostname or "").lower()
    except Exception:
        return ""


def pytest_configure(config: object) -> None:
    import os

    from app.config import get_settings

    dsn = get_settings().DATABASE_URL or ""
    host = _database_host(dsn)

    if not host or host in LOCAL_HOSTS or os.getenv(ALLOW_REMOTE_ENV) == "1":
        return

    raise pytest.UsageError(
        f"Refusing to run the test suite against a remote database (host: {host}).\n"
        "\n"
        "Some tests write to the database - test_smoke.py registers a user - so\n"
        "pointing this suite at production can create real rows.\n"
        "\n"
        "Point DATABASE_URL at a disposable database instead, or set "
        f"{ALLOW_REMOTE_ENV}=1 to override."
    )
