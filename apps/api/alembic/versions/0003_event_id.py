"""events.event_id — an idempotency key so a retried batch cannot double-count

Revision ID: 0003_event_id
Revises: 0002_paystack_rename
Create Date: 2026-10-04

The tracking script retries a failed batch and replays its persisted queue on the
next page load, so the same event can legitimately arrive more than once. Each
event carries a client-generated id, and a unique index on it lets the insert
ignore the duplicate instead of counting the pageview twice.

``VARCHAR``, not ``UUID``: the value comes from a browser, and a malformed one
must not fail the insert. A plain unique index still permits any number of NULLs,
so rows written before this column existed — or by a client that sends no id —
are unaffected.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0003_event_id"
down_revision = "0002_paystack_rename"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""-- Client-side idempotency key for collected events.
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_id VARCHAR(100);

-- Plain (not partial) unique index: Postgres treats NULLs as distinct, so every
-- pre-existing row keeps a NULL and stays conflict-free, while a repeated
-- non-NULL id is rejected. It is also what lets `ON CONFLICT (event_id)` infer
-- its arbiter without repeating a predicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_id ON events(event_id);
"""

_DOWNGRADE_SQL = r"""DROP INDEX IF EXISTS idx_events_event_id;
ALTER TABLE events DROP COLUMN IF EXISTS event_id;
"""


def upgrade() -> None:
    """Add the event idempotency column and its unique index."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop the index and the column."""
    run_sql_script(_DOWNGRADE_SQL)
