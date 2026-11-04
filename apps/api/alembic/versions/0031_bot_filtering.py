"""Bot filtering

Revision ID: 0031_bot_filtering
Revises: 0030_anomalies
Create Date: 2026-11-04

* ``bot_hits``: events turned away by rule when they arrived (a crawler's
  browser name, a spam referrer), counted per site, day and reason, with the
  last browser name seen. Nothing else of them is stored.
* ``bot_sessions``: visits the hourly check (``jobs/bot_check``) found behaved
  like a bot. The session row and its events are moved here as JSON, so no
  dashboard page, report or model counts them, but they can still be reviewed.
  Kept for 30 days.
* ``sessions.bot_checked_at``: when the check looked at a visit and found a
  person. The check reads recent visits per site through the existing
  (domain_id, started_at) index, so no new index is needed.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0031_bot_filtering"
down_revision = "0030_anomalies"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""CREATE TABLE IF NOT EXISTS bot_hits (
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    reason VARCHAR(30) NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    sample_user_agent TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (domain_id, day, reason)
);

CREATE TABLE IF NOT EXISTS bot_sessions (
    id UUID PRIMARY KEY,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE,
    score DOUBLE PRECISION NOT NULL,
    reasons TEXT[] NOT NULL,
    pageviews INTEGER NOT NULL DEFAULT 0,
    events_count INTEGER NOT NULL DEFAULT 0,
    session JSONB NOT NULL,
    events JSONB NOT NULL DEFAULT '[]'::jsonb,
    flagged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_sessions_domain ON bot_sessions(domain_id, flagged_at DESC);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS bot_checked_at TIMESTAMP WITH TIME ZONE;
"""

_DOWNGRADE_SQL = r"""ALTER TABLE sessions DROP COLUMN IF EXISTS bot_checked_at;
DROP TABLE IF EXISTS bot_sessions;
DROP TABLE IF EXISTS bot_hits;
"""


def upgrade() -> None:
    """Create the bot tables and the sessions check column."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop them."""
    run_sql_script(_DOWNGRADE_SQL)
