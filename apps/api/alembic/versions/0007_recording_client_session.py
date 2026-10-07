"""Keep the tracker's session id on session_recordings

Revision ID: 0007_recording_client_session
Revises: 0006_subscriptions_constraints
Create Date: 2026-10-07

``session_recordings.session_id`` is a foreign key to ``sessions.id`` (the
server-generated surrogate), but ``POST /recording/start`` receives the tracker's
client-side session id (``sessions.session_id``). Writing that value into the FK
column violated the constraint, so every tracker-started recording failed.

The tracker starts recording on init while the first pageview is still queued, so
on a session's first page the ``sessions`` row usually does not exist yet. The
client id is stored here so the link can be resolved when the recording ends,
and so recordings can be joined to their session without the FK.

Additive and nullable: safe to apply ahead of the deploy.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0007_recording_client_session"
down_revision = "0006_subscriptions_constraints"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE session_recordings
    ADD COLUMN IF NOT EXISTS client_session_id VARCHAR(100);
"""

_DOWNGRADE_SQL = r"""ALTER TABLE session_recordings
    DROP COLUMN IF EXISTS client_session_id;
"""


def upgrade() -> None:
    """Add the nullable client session id column."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop the client session id column."""
    run_sql_script(_DOWNGRADE_SQL)
