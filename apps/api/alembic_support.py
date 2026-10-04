"""Helpers for running raw SQL migrations through Alembic.

The revisions in ``alembic/versions/`` carry their SQL inline (self-contained
migrations) and run it through this module.

Why not just ``op.execute(sql)``? SQLAlchemy's asyncpg dialect prepares most
statements, and PostgreSQL cannot ``PREPARE`` a multi-statement script or a
``DO $$ ... $$;`` block — both of which appear in the baseline migration.
asyncpg's *simple query protocol* can run them as a single batch, so we reach
the driver connection and execute there.
"""

from __future__ import annotations

from sqlalchemy.util import await_only

from alembic import context, op


def run_sql_script(sql: str) -> None:
    """Execute a (possibly multi-statement) SQL script as part of a migration."""
    if context.is_offline_mode():
        # No live connection — emit the script so `alembic upgrade --sql` works.
        op.execute(sql)
        return

    connection = op.get_bind()
    # Connection -> DBAPI (AsyncAdapt_asyncpg_connection) -> asyncpg.Connection
    raw = connection.connection.dbapi_connection.driver_connection
    # We are inside Alembic's `run_sync` greenlet, so the coroutine can be
    # driven synchronously here.
    await_only(raw.execute(sql))
