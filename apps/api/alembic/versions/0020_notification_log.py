"""Remember which notification emails went out

Revision ID: 0020_notification_log
Revises: 0019_funnel_step_field
Create Date: 2026-10-09

The weekly report and the AI insight alerts (Settings → Notifications) run on a
schedule. ``notification_log`` records each one sent — ``kind`` is
'weekly_report' or 'insight', ``key`` the ISO week or the insight — so a run
that repeats, or a second instance, never sends the same email twice.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0020_notification_log"
down_revision = "0019_funnel_step_field"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""CREATE TABLE IF NOT EXISTS notification_log (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind    VARCHAR(30) NOT NULL,
    key     TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, kind, key)
);

CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log (sent_at);
"""

_DOWNGRADE_SQL = r"""DROP TABLE IF EXISTS notification_log;
"""


def upgrade() -> None:
    """Create notification_log."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop notification_log."""
    run_sql_script(_DOWNGRADE_SQL)
