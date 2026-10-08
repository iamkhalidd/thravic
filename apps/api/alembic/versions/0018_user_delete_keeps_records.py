"""Deleting a user keeps the records that point at them

Revision ID: 0018_user_delete_keeps_records
Revises: 0017_user_profile
Create Date: 2026-10-08

Four foreign keys to ``users`` had no ON DELETE action, so deleting any user
who had ever done an admin action, changed a system setting, created a promo
code or redeemed one failed with a foreign-key error (admin delete answered
500; the under-18 cleanup job skipped them). Those rows are records worth
keeping, so they now keep their data and lose only the link, as
``payment_history`` does since 0015.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0018_user_delete_keeps_records"
down_revision = "0017_user_profile"
branch_labels = None
depends_on = None

# (table, column, constraint)
_KEYS = (
    ("admin_audit_log", "admin_id", "admin_audit_log_admin_id_fkey"),
    ("system_settings", "updated_by", "system_settings_updated_by_fkey"),
    ("promo_codes", "created_by", "promo_codes_created_by_fkey"),
    ("promo_redemptions", "user_id", "promo_redemptions_user_id_fkey"),
)


def _sql(on_delete: str) -> str:
    statements = []
    for table, column, constraint in _KEYS:
        if on_delete:
            statements.append(f"ALTER TABLE {table} ALTER COLUMN {column} DROP NOT NULL;")
        statements.append(
            f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint};\n"
            f"ALTER TABLE {table} ADD CONSTRAINT {constraint} "
            f"FOREIGN KEY ({column}) REFERENCES users(id){on_delete};"
        )
    return "\n".join(statements)


def upgrade() -> None:
    """Make the four keys ON DELETE SET NULL (and their columns nullable)."""
    run_sql_script(_sql(" ON DELETE SET NULL"))


def downgrade() -> None:
    """Restore the keys without an ON DELETE action (columns stay nullable)."""
    run_sql_script(_sql(""))
