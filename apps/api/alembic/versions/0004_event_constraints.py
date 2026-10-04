"""Widen the events.type and sessions.source_type CHECK constraints

Revision ID: 0004_event_constraints
Revises: 0003_event_id
Create Date: 2026-10-04

Both constraints rejected values the application has always produced. Found by
driving the real tracker through a real browser against the real API — nothing
here is theoretical:

* ``events.type`` omitted ``session_end``, which the tracker queues on every page
  hide and ``collect.py``'s ``EVENT_TYPES`` allows. Every unload was rejected with
  a 500, and the client (at-least-once) retried it forever.

* ``sessions.source_type`` listed ``search``/``ad``/``campaign``, but
  ``session_service.classify_source()`` returns ``organic`` (search engines) and
  ``paid`` (UTM/campaign traffic) — and ``analytics.py``/``sources.py`` both build
  their breakdown from ``("direct","organic","paid","social","referral","email")``.
  So organic and paid sessions — most real traffic — failed the constraint and
  were silently dropped while ``/health`` stayed green.

Purely additive: the old values are kept so no existing row can be invalidated.
Idempotent, so applying it by hand as a hotfix and again via a deploy is safe.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0004_event_constraints"
down_revision = "0003_event_id"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""-- events.type: add the session_end the tracker actually sends.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check;
ALTER TABLE events ADD CONSTRAINT events_type_check
    CHECK (type IN ('pageview', 'click', 'scroll', 'form', 'custom', 'session_end'));

-- sessions.source_type: the values classify_source() produces, plus the original
-- ones so no existing row can become invalid.
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_source_type_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_source_type_check
    CHECK (source_type IN (
        'direct', 'organic', 'paid', 'social', 'referral', 'email',
        'search', 'ad', 'campaign', 'internal'
    ));
"""

# Restore the original (narrower) constraints.
_DOWNGRADE_SQL = r"""ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check;
ALTER TABLE events ADD CONSTRAINT events_type_check
    CHECK (type IN ('pageview', 'click', 'scroll', 'form', 'custom'));

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_source_type_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_source_type_check
    CHECK (source_type IN (
        'direct', 'search', 'social', 'referral', 'email',
        'ad', 'campaign', 'internal'
    ));
"""


def upgrade() -> None:
    """Accept every event type and source type the application emits."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Restore the original, narrower constraints."""
    run_sql_script(_DOWNGRADE_SQL)
