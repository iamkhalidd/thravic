"""Index recordings by domain and start time

Revision ID: 0012_recordings_domain_started
Revises: 0011_recording_chunks
Create Date: 2026-10-07

``POST /recording/start`` now counts the domain's recordings since midnight UTC to
enforce its daily limit, and the Sessions list orders by ``started_at``; both
read ``(domain_id, started_at)``.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0012_recordings_domain_started"
down_revision = "0011_recording_chunks"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""CREATE INDEX IF NOT EXISTS idx_recordings_domain_started
    ON session_recordings(domain_id, started_at);
"""

_DOWNGRADE_SQL = r"""DROP INDEX IF EXISTS idx_recordings_domain_started;
"""


def upgrade() -> None:
    """Add the (domain_id, started_at) index."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop the index."""
    run_sql_script(_DOWNGRADE_SQL)
