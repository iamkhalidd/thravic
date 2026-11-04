"""Anomalies

Revision ID: 0030_anomalies
Revises: 0029_admin_visibility
Create Date: 2026-11-04

Each unusual number the daily scan (``jobs/anomaly_scan``) finds is kept: which
day, which series (``metric`` sessions, errors or a custom ``event``, split by
``dimension`` and ``key``: channel "social", landing page "/pricing", or
"site" for the whole site), what happened against what was expected and the
usual range. ``kind`` is ``day`` (one unusual day) or ``slide`` (a steady move
over weeks; ``actual`` and ``expected`` are then weekly totals). ``score`` is
how far outside the usual it was. AI insights and smart alerts read the table.
Rows older than 90 days are removed by the scan.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0030_anomalies"
down_revision = "0029_admin_visibility"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""CREATE TABLE IF NOT EXISTS anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    metric VARCHAR(30) NOT NULL,
    dimension VARCHAR(30) NOT NULL,
    key TEXT NOT NULL,
    kind VARCHAR(10) NOT NULL,
    direction VARCHAR(4) NOT NULL,
    actual DOUBLE PRECISION NOT NULL,
    expected DOUBLE PRECISION NOT NULL,
    low DOUBLE PRECISION NOT NULL,
    high DOUBLE PRECISION NOT NULL,
    score DOUBLE PRECISION NOT NULL,
    change_pct INTEGER,
    link TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (domain_id, day, metric, dimension, key, kind)
);

CREATE INDEX IF NOT EXISTS idx_anomalies_domain_day ON anomalies(domain_id, day DESC);
"""

_DOWNGRADE_SQL = r"""DROP TABLE IF EXISTS anomalies;
"""


def upgrade() -> None:
    """Create the anomalies table."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop the anomalies table."""
    run_sql_script(_DOWNGRADE_SQL)
