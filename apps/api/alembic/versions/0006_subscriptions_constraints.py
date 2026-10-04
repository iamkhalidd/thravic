"""Make the subscription constraints able to represent what the app sells

Revision ID: 0006_subscriptions_constraints
Revises: 0005_session_pageviews
Create Date: 2026-10-04

Two drifts between the migrations and the production database. Each one breaks
payments, just in opposite directions.

1. ``subscriptions_user_id_unique`` exists in **production only** — no migration
   ever created it. The application depends on it: ``payments._upgrade_subscription``
   upserts with ``INSERT ... ON CONFLICT (user_id)``, which raises "there is no
   unique or exclusion constraint matching the ON CONFLICT specification" without
   it. A database built from these migrations would therefore 500 every successful
   Paystack charge: the customer pays, the subscription is never upgraded and the
   receipt is never sent.

2. ``subscriptions.plan`` accepts different values in each place. The migrations
   have ``('free','pro','agency')`` — which is what the application actually sells
   (``plans.PLAN_LIMITS``, ``plans.PLAN_FEATURES`` and the ``plans`` table all use
   free/pro/agency) — while production has ``('free','growth','pro','enterprise')``.
   So **production cannot store an ``agency`` subscription at all**: the upsert
   fails the CHECK for an agency purchase, and the customer gets no plan.

Widening the vocabulary to the union fixes production without invalidating any
existing row, and leaves a fresh database able to store every plan the application
can produce. The unique constraint is added behind a guard because ``ADD
CONSTRAINT`` has no ``IF NOT EXISTS`` and production already has it.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0006_subscriptions_constraints"
down_revision = "0005_session_pageviews"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""-- 1. The unique constraint the upsert needs. Guarded: production already has it,
--    and a fresh database does not.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'subscriptions'::regclass
          AND conname  = 'subscriptions_user_id_unique'
    ) THEN
        ALTER TABLE subscriptions
            ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
    END IF;
END $$;

-- 2. Every plan the application can sell, plus the values production already
--    accepts so no existing row can become invalid.
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
    CHECK (plan IN ('free', 'pro', 'agency', 'growth', 'enterprise'));
"""

# Only the plan vocabulary is reverted. The unique constraint is deliberately left
# in place: removing it re-creates the defect this revision exists to fix, because
# `ON CONFLICT (user_id)` cannot match without it. Its absence was the bug, not a
# state worth restoring.
_DOWNGRADE_SQL = r"""ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
    CHECK (plan IN ('free', 'pro', 'agency'));
"""


def upgrade() -> None:
    """Guarantee the upsert's unique constraint and accept every sellable plan."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Restore the original plan vocabulary; the unique constraint stays (see note)."""
    run_sql_script(_DOWNGRADE_SQL)
