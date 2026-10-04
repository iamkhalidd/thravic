"""Alembic environment — wired to the app's settings and DSN handling.

This runs migrations against the *same* PostgreSQL database the app uses, reusing
`app.db`'s DSN preparation and SSL decision so the connection behaves identically
to the runtime pool (Neon `sslmode`/`channel_binding` stripping, TLS in prod).

SQL-migration mode: `target_metadata` is `None`. There are no SQLAlchemy models;
revisions execute hand-written SQL via `op.execute(...)`. When models are
introduced later (see README, "Schema and migrations"), set `target_metadata`
here to enable `--autogenerate`.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Reuse the runtime's DSN/SSL logic. These helpers are "private" but are the
# single source of truth for how this project talks to Postgres — duplicating
# them here would risk the migration and the app drifting apart.
from app.config import get_settings
from app.db import _prepare_dsn, _ssl_setting

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# No ORM models yet — revisions are raw SQL (SQL-migration mode).
target_metadata = None


def _database_url_and_connect_args() -> tuple[str, dict[str, object]]:
    """Return a SQLAlchemy async URL plus asyncpg `connect_args`.

    `DATABASE_URL` is a libpq-style URL (possibly with `?sslmode=require`).
    `_prepare_dsn` strips the libpq-only parameters asyncpg rejects, and
    `_ssl_setting` reproduces the app's TLS decision, so migrations connect
    exactly like the runtime does.
    """
    raw = get_settings().DATABASE_URL
    if not raw:
        raise RuntimeError(
            "DATABASE_URL is not set — cannot run migrations. "
            "Set it in the environment or apps/api/.env."
        )

    dsn, ssl_required = _prepare_dsn(raw)

    # Normalise the scheme to the asyncpg SQLAlchemy dialect.
    if dsn.startswith("postgres://"):
        dsn = "postgresql://" + dsn[len("postgres://") :]
    if dsn.startswith("postgresql://"):
        dsn = "postgresql+asyncpg://" + dsn[len("postgresql://") :]

    return dsn, {"ssl": _ssl_setting(ssl_required)}


def run_migrations_offline() -> None:
    """Emit SQL to stdout without connecting to a database."""
    url, _ = _database_url_and_connect_args()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    url, connect_args = _database_url_and_connect_args()

    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = url

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
