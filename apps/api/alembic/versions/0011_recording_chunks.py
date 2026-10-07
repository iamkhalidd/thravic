"""Store screen recordings as compressed chunks

Revision ID: 0011_recording_chunks
Revises: 0010_job_bookkeeping
Create Date: 2026-10-07

Recordings are now rrweb captures (a DOM snapshot plus every change), far larger
than the cursor-only events kept in ``session_recordings.recording_data``.
Appending those to one jsonb value rewrites the whole value on every upload, so
each upload becomes a row in ``recording_chunks`` instead: the batch's events as
gzip-compressed JSON. Postgres would try to compress them again, so the column is
stored uncompressed (``STORAGE EXTERNAL``).

``session_recordings`` gains:

* ``format`` — ``rrweb`` (chunks) or ``legacy`` (``recording_data``, the old
  cursor-only events; every row recorded before this revision).
* ``first_event_ms`` / ``last_event_ms`` — the visitor's clock at the first and
  latest event, which give the duration.
* ``size_bytes`` — compressed bytes stored, to cap one recording's size.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0011_recording_chunks"
down_revision = "0010_job_bookkeeping"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE session_recordings
    ADD COLUMN IF NOT EXISTS format VARCHAR(10) NOT NULL DEFAULT 'legacy',
    ADD COLUMN IF NOT EXISTS first_event_ms BIGINT,
    ADD COLUMN IF NOT EXISTS last_event_ms BIGINT,
    ADD COLUMN IF NOT EXISTS size_bytes BIGINT NOT NULL DEFAULT 0;

-- Existing rows are legacy; new ones are rrweb unless an old tracker appends.
ALTER TABLE session_recordings ALTER COLUMN format SET DEFAULT 'rrweb';

CREATE TABLE IF NOT EXISTS recording_chunks (
    id           BIGSERIAL PRIMARY KEY,
    recording_id UUID NOT NULL REFERENCES session_recordings(id) ON DELETE CASCADE,
    events_count INTEGER NOT NULL,
    data         BYTEA NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE recording_chunks ALTER COLUMN data SET STORAGE EXTERNAL;

CREATE INDEX IF NOT EXISTS idx_recording_chunks_recording
    ON recording_chunks(recording_id, id);
"""

_DOWNGRADE_SQL = r"""DROP TABLE IF EXISTS recording_chunks;
ALTER TABLE session_recordings
    DROP COLUMN IF EXISTS size_bytes,
    DROP COLUMN IF EXISTS last_event_ms,
    DROP COLUMN IF EXISTS first_event_ms,
    DROP COLUMN IF EXISTS format;
"""


def upgrade() -> None:
    """Add recording_chunks and the rrweb bookkeeping columns."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop recording_chunks and the added columns."""
    run_sql_script(_DOWNGRADE_SQL)
