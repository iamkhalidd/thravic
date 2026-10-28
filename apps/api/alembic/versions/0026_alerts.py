"""Smart alerts

Revision ID: 0026_alerts
Revises: 0025_plan_limits
Create Date: 2026-10-28

Each alert the hourly check raises (``jobs/smart_alerts``) is kept, so the
dashboard's Alerts page shows them after the email is gone. ``link`` is a
dashboard path and ``recordings`` holds up to three recording ids that show the
problem.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0026_alerts"
down_revision = "0025_plan_limits"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    kind VARCHAR(30) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    recordings JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_domain_created ON alerts(domain_id, created_at DESC);
"""

_DOWNGRADE_SQL = r"""DROP TABLE IF EXISTS alerts;
"""


def upgrade() -> None:
    """Create the alerts table."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop the alerts table."""
    run_sql_script(_DOWNGRADE_SQL)
