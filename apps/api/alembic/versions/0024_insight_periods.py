"""Insight reports for any date range

Revision ID: 0024_insight_periods
Revises: 0023_admin_security
Create Date: 2026-10-28

The insights page follows the dashboard's date range instead of always the last
7 days. Each report stores the period it covers, and ``period_key`` (the period
rounded as in ``insight_service.period``) is what a day's reports are cached by.
Older rows have no period and are never matched; they covered the 7 days before
``created_at``.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0024_insight_periods"
down_revision = "0023_admin_security"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE insight_reports
    ADD COLUMN IF NOT EXISTS period_start TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS period_end TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS period_key VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_insight_reports_domain_period
    ON insight_reports(domain_id, period_key, created_at DESC);
"""

_DOWNGRADE_SQL = r"""DROP INDEX IF EXISTS idx_insight_reports_domain_period;
ALTER TABLE insight_reports
    DROP COLUMN IF EXISTS period_start,
    DROP COLUMN IF EXISTS period_end,
    DROP COLUMN IF EXISTS period_key;
"""


def upgrade() -> None:
    """Add the period columns."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop the period columns."""
    run_sql_script(_DOWNGRADE_SQL)
