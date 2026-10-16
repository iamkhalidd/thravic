"""Two-step sign-in for admins, and daily totals for the admin overview

Revision ID: 0023_admin_security
Revises: 0022_assistant_questions
Create Date: 2026-10-16

* ``users.totp_secret`` holds an admin's authenticator-app key, encrypted (see
  ``services/admin_2fa.py``). ``totp_enabled_at`` is when it was set up, and
  ``totp_last_step`` the last 30-second window a code was accepted for, so one
  code cannot be used twice.
* ``daily_domain_stats`` keeps each site's events, page views and sessions per
  day (Lagos time). The admin overview reads these small totals instead of
  counting the events table on every load, and they outlive data retention.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0023_admin_security"
down_revision = "0022_assistant_questions"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE users
    ADD COLUMN IF NOT EXISTS totp_secret TEXT,
    ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS totp_last_step BIGINT;

CREATE TABLE IF NOT EXISTS daily_domain_stats (
    day        DATE NOT NULL,
    domain_id  UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    events     INTEGER NOT NULL DEFAULT 0,
    pageviews  INTEGER NOT NULL DEFAULT 0,
    sessions   INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (day, domain_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_domain_stats_domain ON daily_domain_stats (domain_id, day);
"""

_DOWNGRADE_SQL = r"""DROP TABLE IF EXISTS daily_domain_stats;
ALTER TABLE users
    DROP COLUMN IF EXISTS totp_last_step,
    DROP COLUMN IF EXISTS totp_enabled_at,
    DROP COLUMN IF EXISTS totp_secret;
"""


def upgrade() -> None:
    """Add admin authenticator columns and the daily totals table."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop the daily totals table and the authenticator columns."""
    run_sql_script(_DOWNGRADE_SQL)
