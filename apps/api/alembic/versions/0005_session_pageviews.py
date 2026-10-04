"""Backfill sessions.pageviews from the events table

Revision ID: 0005_session_pageviews
Revises: 0004_event_constraints
Create Date: 2026-10-04

``sessions.pageviews`` was maintained as a counter that the collector incremented
once per event (``pageviews = sessions.pageviews + 1`` inside the batch loop), so
it counted *events transmitted* rather than *pages viewed*:

* a session with one ``pageview`` plus one ``performance`` custom event — the
  normal shape of a single page load — was stored as ``pageviews = 2``;
* the tracker re-sends a batch until the server acknowledges it, and the unload
  path (``sendBeacon``) keeps its queue on purpose, so every retry added another
  phantom pageview even though ``ON CONFLICT (event_id)`` discarded the event;
* measured on production: a session holding **1** real pageview event reported
  ``pageviews = 9``.

The blast radius was wide because the column is read through ``SELECT *`` in
several places: ``session_service.get_bounce_rate()`` (which uses
``pageviews <= 1``, so bounce rate was pinned at 0.00%), the customer export, the
admin export, ``sources.py`` and the admin dashboard.

The application now derives the value from the deduplicated ``events`` rows
(``event_service.recount_pageviews``) instead of incrementing it, which makes the
write idempotent. This revision corrects the rows written before that fix.

Idempotent: re-running recomputes the same value. No schema change, so it is safe
to apply by hand as a hotfix and again via a deploy.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0005_session_pageviews"
down_revision = "0004_event_constraints"
branch_labels = None
depends_on = None

# One pass over `sessions`; the correlated count is served by the
# (session_id, type) lookups the ingestion path already relies on.
_UPGRADE_SQL = r"""UPDATE sessions s
SET pageviews = (
    SELECT COUNT(*) FROM events e
    WHERE e.session_id = s.id AND e.type = 'pageview'
);
"""

# The previous values were inflated and carried no information, so there is
# nothing meaningful to restore. Deliberately a no-op rather than a reverse
# recompute, which would just write the same corrected numbers back.
_DOWNGRADE_SQL = r"""-- no-op: the pre-0005 values were wrong and are not recoverable
"""


def upgrade() -> None:
    """Recompute every session's pageview count from its stored pageview events."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """No-op — the replaced values were inflated and are intentionally not restored."""
    run_sql_script(_DOWNGRADE_SQL)
