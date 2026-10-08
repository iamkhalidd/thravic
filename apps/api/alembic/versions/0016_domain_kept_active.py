"""Let owners choose which sites keep collecting over their plan's limit

Revision ID: 0016_domain_kept_active
Revises: 0015_subscription_periods
Create Date: 2026-10-08

When a paid plan lapses, an owner can have more sites than the free plan covers.
Those over the limit stop collecting (nothing is deleted); which ones keep
collecting is the owner's choice, recorded as ``kept_active_at``: sites chosen
most recently come first, then the oldest sites.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0016_domain_kept_active"
down_revision = "0015_subscription_periods"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE domains ADD COLUMN IF NOT EXISTS kept_active_at TIMESTAMP WITH TIME ZONE;
"""

_DOWNGRADE_SQL = r"""ALTER TABLE domains DROP COLUMN IF EXISTS kept_active_at;
"""


def upgrade() -> None:
    """Add domains.kept_active_at."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop domains.kept_active_at."""
    run_sql_script(_DOWNGRADE_SQL)
