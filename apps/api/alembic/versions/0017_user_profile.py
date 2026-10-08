"""Date of birth, and a way to restrict an account

Revision ID: 0017_user_profile
Revises: 0016_domain_kept_active
Create Date: 2026-10-08

Thravic is for adults: sign-up asks for a date of birth and refuses anyone under
18. ``date_of_birth`` stores it (set once; only support changes it). Accounts
that turn out to belong to someone under 18 are restricted rather than deleted
at once: ``restricted_reason`` locks the dashboard and stops collection, and
``restricted_at`` starts the 30 days after which the account is deleted unless
support lifts the restriction.

Existing users have no date of birth, so they are asked for one (with the other
required fields) on their next visit; nothing is backfilled.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0017_user_profile"
down_revision = "0016_domain_kept_active"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE users
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS restricted_reason VARCHAR(40),
    ADD COLUMN IF NOT EXISTS restricted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS users_restricted_idx
    ON users (restricted_at) WHERE restricted_reason IS NOT NULL;
"""

_DOWNGRADE_SQL = r"""DROP INDEX IF EXISTS users_restricted_idx;
ALTER TABLE users
    DROP COLUMN IF EXISTS restricted_at,
    DROP COLUMN IF EXISTS restricted_reason,
    DROP COLUMN IF EXISTS date_of_birth;
"""


def upgrade() -> None:
    """Add users.date_of_birth, restricted_reason and restricted_at."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop them."""
    run_sql_script(_DOWNGRADE_SQL)
