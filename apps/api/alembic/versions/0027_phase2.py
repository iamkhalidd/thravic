"""Slack and Zapier connections, and visitor timelines

Revision ID: 0027_phase2
Revises: 0026_alerts
Create Date: 2026-10-28

``webhooks.kind`` says how a webhook is delivered: 'custom' (every existing row,
the signed JSON body), 'slack' (a Slack incoming webhook, sent as a message) or
'zapier' (a Zapier catch hook, the same JSON as custom).

Visitor profiles read a visitor's events in time order, so ``events`` gets an
index on ``(visitor_id, created_at)``.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0027_phase2"
down_revision = "0026_alerts"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE webhooks
    ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'custom';
ALTER TABLE webhooks DROP CONSTRAINT IF EXISTS webhooks_kind_check;
ALTER TABLE webhooks ADD CONSTRAINT webhooks_kind_check
    CHECK (kind IN ('custom', 'slack', 'zapier'));

CREATE INDEX IF NOT EXISTS idx_events_visitor_created ON events(visitor_id, created_at DESC);
"""

_DOWNGRADE_SQL = r"""DROP INDEX IF EXISTS idx_events_visitor_created;
ALTER TABLE webhooks DROP CONSTRAINT IF EXISTS webhooks_kind_check;
ALTER TABLE webhooks DROP COLUMN IF EXISTS kind;
"""


def upgrade() -> None:
    """Add webhooks.kind and the visitor timeline index."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop them."""
    run_sql_script(_DOWNGRADE_SQL)
