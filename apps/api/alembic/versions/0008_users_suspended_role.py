"""Let users.role store 'suspended'

Revision ID: 0008_users_suspended_role
Revises: 0007_recording_client_session
Create Date: 2026-10-07

``POST /api/admin/users/{id}/suspend`` suspends a user by setting
``role = 'suspended'``, but the baseline CHECK only allows
``('user', 'admin', 'super_admin')``. On a database built from these migrations
the UPDATE fails the constraint, so the endpoint answers 500 and the account is
never suspended.

The constraint is replaced rather than altered (Postgres cannot alter a CHECK).
Widening it cannot invalidate an existing row.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0008_users_suspended_role"
down_revision = "0007_recording_client_session"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'admin', 'super_admin', 'suspended'));
"""

# Suspended users are reactivated first: the narrower constraint cannot hold them,
# and leaving them blocked under a role the schema no longer knows is worse.
_DOWNGRADE_SQL = r"""UPDATE users SET role = 'user' WHERE role = 'suspended';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'admin', 'super_admin'));
"""


def upgrade() -> None:
    """Accept the 'suspended' role the admin suspend endpoint writes."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Reactivate suspended users and restore the original role vocabulary."""
    run_sql_script(_DOWNGRADE_SQL)
