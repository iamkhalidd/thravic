"""Funnel steps say which field they match, and accept custom events

Revision ID: 0019_funnel_step_field
Revises: 0018_user_delete_keeps_records
Create Date: 2026-10-08

The funnel builder asks which field a step matches (URL, path, referrer, element
id or class, event name) but the choice was never stored, so every step matched
the page URL or path. ``match_field`` keeps it; NULL keeps the old behaviour for
steps saved before this (page steps match the URL or its path, custom event
steps match the event name).

The baseline allowed step types 'pageview', 'event' and 'click', but the API
and the builder send 'custom' for custom events, so saving such a step failed
the CHECK. 'custom' is now allowed ('event' stays for any old rows).
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0019_funnel_step_field"
down_revision = "0018_user_delete_keeps_records"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE funnel_steps
    ADD COLUMN IF NOT EXISTS match_field VARCHAR(30);

ALTER TABLE funnel_steps DROP CONSTRAINT IF EXISTS funnel_steps_type_check;
ALTER TABLE funnel_steps ADD CONSTRAINT funnel_steps_type_check
    CHECK (type IN ('pageview', 'click', 'custom', 'event'));
"""

_DOWNGRADE_SQL = r"""ALTER TABLE funnel_steps DROP CONSTRAINT IF EXISTS funnel_steps_type_check;
ALTER TABLE funnel_steps ADD CONSTRAINT funnel_steps_type_check
    CHECK (type IN ('pageview', 'event', 'click')) NOT VALID;

ALTER TABLE funnel_steps DROP COLUMN IF EXISTS match_field;
"""


def upgrade() -> None:
    """Add funnel_steps.match_field and allow the 'custom' step type."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop match_field and restore the original type check (existing rows unchecked)."""
    run_sql_script(_DOWNGRADE_SQL)
