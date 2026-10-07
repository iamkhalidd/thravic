"""Bookkeeping for scheduled jobs: last runs and sent limit notices

Revision ID: 0010_job_bookkeeping
Revises: 0009_domain_settings
Create Date: 2026-10-07

The API runs its jobs in-process, on a host that sleeps when idle and may run
more than one instance. Fixed-time schedules would be skipped while asleep and
doubled across instances, so jobs check hourly and decide from these tables:

* ``job_runs`` — when each job last completed, so a daily job runs once a day
  whenever the process is awake, and exactly once across instances (each run
  also holds a Postgres advisory lock).
* ``limit_notifications`` — which usage emails (80% / 100%) went to which user in
  which month, so each is sent once however often the check runs.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0010_job_bookkeeping"
down_revision = "0009_domain_settings"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""CREATE TABLE IF NOT EXISTS job_runs (
    name        VARCHAR(100) PRIMARY KEY,
    last_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
    details     JSONB
);

CREATE TABLE IF NOT EXISTS limit_notifications (
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month     DATE NOT NULL,
    threshold SMALLINT NOT NULL,
    sent_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, month, threshold)
);
"""

_DOWNGRADE_SQL = r"""DROP TABLE IF EXISTS limit_notifications;
DROP TABLE IF EXISTS job_runs;
"""


def upgrade() -> None:
    """Create job_runs and limit_notifications."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop the bookkeeping tables."""
    run_sql_script(_DOWNGRADE_SQL)
