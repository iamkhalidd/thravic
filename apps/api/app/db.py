"""Postgres access — asyncpg pool mirroring the Express `db/index.ts` helpers.

Deliberately raw SQL rather than an ORM: the existing queries are hand-written
SQL using `$1` placeholders, which is exactly asyncpg's convention, so they port
across nearly verbatim and keep their row shapes and aggregations identical.
"""

from __future__ import annotations

import asyncio
import json
import ssl as ssl_module
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import asyncpg

from .config import get_settings
from .errors import AppError
from .logging import create_logger

log = create_logger("DB")

pool: asyncpg.Pool | None = None

MAX_RETRIES = 3
BASE_DELAY_SECONDS = 3  # 3s, then 6s, then 12s


# ── Type codecs ───────────────────────────────────────────────────────────────
# This is the single most important block for response parity. The frontends were
# built against what node-postgres returns, not against asyncpg's defaults.
#
#   json / jsonb  asyncpg would return a *string*; node-postgres parses it.
#   int8          node-postgres returns bigint as a string (COUNT(*) -> "42").
#   numeric       node-postgres returns numeric as a string, preserving precision.
#   date          node-postgres parses DATE into a JS Date; a UTC host yields
#                 midnight UTC, which is what we produce here.
#
# PARITY NOTE: these four mappings are asserted by the parity harness. If a
# comparison fails on a numeric-looking field, check here first.


def _decode_text(raw: str) -> str:
    """Return the raw wire text unchanged (node-postgres string semantics)."""
    return raw


def _encode_text(value: Any) -> str:
    return str(value)


def _decode_date(raw: str) -> datetime:
    year, month, day = (int(part) for part in raw.split("-")[:3])
    return datetime(year, month, day, tzinfo=UTC)


async def _init_connection(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec(
        "json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )
    await conn.set_type_codec(
        "int8",
        encoder=_encode_text,
        decoder=_decode_text,
        schema="pg_catalog",
        format="text",
    )
    await conn.set_type_codec(
        "numeric",
        encoder=_encode_text,
        decoder=_decode_text,
        schema="pg_catalog",
        format="text",
    )
    await conn.set_type_codec(
        "date",
        encoder=lambda value: value.isoformat() if hasattr(value, "isoformat") else str(value),
        decoder=_decode_date,
        schema="pg_catalog",
        format="text",
    )


def _prepare_dsn(raw: str) -> tuple[str, bool]:
    """Strip libpq-only SSL parameters and report whether TLS is required.

    Neon connection strings carry `?sslmode=require&channel_binding=require`.
    asyncpg has no `sslmode` argument and would forward unknown keys to the server
    as runtime settings, which Postgres rejects. TLS is configured explicitly via
    the `ssl` argument instead, so these are removed from the DSN here.

    Returns `(dsn, ssl_required)`.
    """
    parsed = urlparse(raw)
    if not parsed.query:
        return raw, False

    params = parse_qs(parsed.query, keep_blank_values=True)
    sslmode = (params.pop("sslmode", [""] ) or [""])[0].lower()
    params.pop("channel_binding", None)

    ssl_required = sslmode in ("require", "verify-ca", "verify-full")

    remaining = urlencode({k: v[0] for k, v in params.items()})
    cleaned = urlunparse(parsed._replace(query=remaining))
    return cleaned, ssl_required


def _ssl_setting(ssl_required: bool) -> Any:
    """Mirror `pg`'s behaviour (`ssl: { rejectUnauthorized: false }` in production).

    TLS is used when the DSN asks for it, or in production — which is exactly when
    the Express backend enables it.
    """
    if not ssl_required and not get_settings().is_production:
        return None

    context = ssl_module.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl_module.CERT_NONE
    return context


def get_pool() -> asyncpg.Pool:
    if pool is None:
        raise AppError("Database is not initialised", 503, "DB_UNAVAILABLE")
    return pool


# ── Query helpers (same contract as the Express helpers) ──────────────────────


async def query(sql: str, *params: Any) -> list[dict[str, Any]]:
    """Run a query and return rows as plain dicts (equivalent of `query()`)."""
    started = time.perf_counter()
    try:
        rows = await get_pool().fetch(sql, *params)
    except Exception as exc:  # surfaced to the caller, logged here for parity
        log.error(f"Query error: {exc}")
        raise

    if not get_settings().is_production:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.debug(f"Query executed in {elapsed_ms}ms: {sql[:100]}")

    return [dict(row) for row in rows]


async def query_one(sql: str, *params: Any) -> dict[str, Any] | None:
    """Return the first row, or `None` (equivalent of `queryOne()`)."""
    rows = await query(sql, *params)
    return rows[0] if rows else None


async def execute(sql: str, *params: Any) -> str:
    """Run a statement that returns no rows (INSERT/UPDATE/DELETE without RETURNING)."""
    return await get_pool().execute(sql, *params)


@asynccontextmanager
async def transaction() -> AsyncIterator[asyncpg.Connection]:
    """Run a block inside a transaction, rolling back on error."""
    async with get_pool().acquire() as conn:
        async with conn.transaction():
            yield conn


# ── Transient-failure retry ──────────────────────────────────────────────────
# A synchronous write request is directly exposed to short connection blips:
# Neon cold starts, pooler recycling, a statement cancelled by a timeout. Those
# are worth another attempt. A constraint violation or a syntax error is not —
# retrying it fails identically and only adds latency.

RETRY_ATTEMPTS = 3
RETRY_BASE_DELAY_SECONDS = 0.05

_TRANSIENT_EXCEPTIONS: tuple[type[BaseException], ...] = (
    asyncpg.exceptions.PostgresConnectionError,
    asyncpg.exceptions.InterfaceError,
    asyncpg.exceptions.AdminShutdownError,
    asyncpg.exceptions.CannotConnectNowError,
    asyncpg.exceptions.TooManyConnectionsError,
    asyncpg.exceptions.QueryCanceledError,
    asyncpg.exceptions.DeadlockDetectedError,
    asyncpg.exceptions.SerializationError,
    ConnectionError,
    TimeoutError,  # also covers asyncio.TimeoutError on 3.11+
    OSError,
)


def is_transient(exc: BaseException) -> bool:
    """True for connection-level failures that are worth retrying."""
    return isinstance(exc, _TRANSIENT_EXCEPTIONS)


async def retry_transient(
    operation: Callable[[], Awaitable[Any]],
    *,
    description: str,
    attempts: int = RETRY_ATTEMPTS,
    base_delay: float = RETRY_BASE_DELAY_SECONDS,
) -> Any:
    """Run `operation`, retrying only transient failures with a short backoff.

    Wrap *one* logical write at a time, never a group of them: an operation that
    already succeeded is never replayed, so a retry cannot double-apply a side
    effect (such as a duplicate `sessions` row).
    """
    for attempt in range(1, attempts + 1):
        try:
            return await operation()
        except Exception as exc:
            if attempt == attempts or not is_transient(exc):
                raise
            delay = base_delay * (2 ** (attempt - 1))
            log.warning(
                f"{description} failed (attempt {attempt}/{attempts}): {exc} — "
                f"retrying in {delay:.2f}s"
            )
            await asyncio.sleep(delay)

    raise AssertionError("retry_transient fell through")  # pragma: no cover


# ── Lifecycle ────────────────────────────────────────────────────────────────


async def init_database() -> None:
    """Connect with retries (Neon cold starts) and verify the pool.

    The schema is owned by Alembic — run ``alembic upgrade head`` as a deploy
    step. This function only establishes and verifies the connection pool.
    """
    global pool

    settings = get_settings()
    if not settings.DATABASE_URL:
        log.warning(
            "DATABASE_URL not set — API routes will fail without a PostgreSQL connection. "
            "Set DATABASE_URL=postgresql://user:pass@localhost:5432/thravic"
        )
        return

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            log.info(f"Initializing database... (attempt {attempt}/{MAX_RETRIES})")

            dsn, ssl_required = _prepare_dsn(settings.DATABASE_URL)

            pool = await asyncpg.create_pool(
                dsn=dsn,
                ssl=_ssl_setting(ssl_required),
                min_size=1,
                max_size=20,  # mirrors the Express pool max
                max_inactive_connection_lifetime=30,
                timeout=10,  # Neon cold starts can take 5-8s
                command_timeout=60,
                init=_init_connection,
            )

            # Verify connectivity
            async with pool.acquire() as conn:
                await conn.execute("SELECT NOW()")
            log.info("Database connected")
            return

        except Exception as exc:
            log.error(f"Attempt {attempt}/{MAX_RETRIES} failed: {exc}")
            if pool is not None:
                await pool.close()
                pool = None
            if attempt == MAX_RETRIES:
                log.error("All connection attempts exhausted. Giving up.")
                raise
            delay = BASE_DELAY_SECONDS * (2 ** (attempt - 1))
            log.info(f"Retrying in {delay}s...")
            await asyncio.sleep(delay)


async def close_database() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None
        log.info("Connection pool closed")
