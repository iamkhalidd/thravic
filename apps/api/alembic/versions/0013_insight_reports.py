"""Store generated AI insight reports

Revision ID: 0013_insight_reports
Revises: 0012_recordings_domain_started
Create Date: 2026-10-08

Insights were generated on every page load: a slow, paid model call each time,
and different answers on every refresh. Each report is now stored and served
for the rest of the UTC day; a refresh makes a new one (capped per day).

* ``trigger`` — ``auto`` (first view of the day) or ``refresh`` (button).
* ``status`` — ``ok`` or ``insufficient_data`` (too few sessions to say anything).
* ``facts`` — the numbers the insights were built from, kept so each insight's
  evidence can be shown and checked later.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0013_insight_reports"
down_revision = "0012_recordings_domain_started"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""CREATE TABLE IF NOT EXISTS insight_reports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id    UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    trigger      VARCHAR(10) NOT NULL,
    status       VARCHAR(20) NOT NULL,
    ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    insights     JSONB NOT NULL DEFAULT '[]'::jsonb,
    facts        JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_insight_reports_domain_created
    ON insight_reports(domain_id, created_at DESC);
"""

_DOWNGRADE_SQL = r"""DROP TABLE IF EXISTS insight_reports;
"""


def upgrade() -> None:
    """Create insight_reports."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop insight_reports."""
    run_sql_script(_DOWNGRADE_SQL)
