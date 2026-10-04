"""paystack: rename Stripe columns to Paystack equivalents

Revision ID: 0002_paystack_rename
Revises: 0001_baseline
Create Date: 2026-10-04

The first real increment after the baseline: renames the billing columns the old
Stripe integration created. The script is idempotent (it checks
``information_schema`` first), so it is safe on databases where the rename has
already happened.

Databases that predate the rename should be baselined at ``0001_baseline`` (not
``head``) and then upgraded, so this revision runs:

    alembic stamp 0001_baseline
    alembic upgrade head
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0002_paystack_rename"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

# Renames the Stripe billing columns to their Paystack equivalents. Idempotent:
# guarded by information_schema checks, so it is safe where the rename happened.
_PAYSTACK_SQL = r"""-- Thravic — Paystack Migration
-- Run this once against your production database to rename Stripe columns.
-- Safe to run even if the columns don't exist yet (uses IF EXISTS).

-- Rename stripe_customer_id → paystack_customer_code on users table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'stripe_customer_id'
    ) THEN
        ALTER TABLE users RENAME COLUMN stripe_customer_id TO paystack_customer_code;
    ELSE
        -- Add the column if it didn't exist at all
        ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;
    END IF;
END $$;

-- Rename stripe_subscription_id → paystack_subscription_code on users table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'stripe_subscription_id'
    ) THEN
        ALTER TABLE users RENAME COLUMN stripe_subscription_id TO paystack_subscription_code;
    ELSE
        ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_subscription_code TEXT;
    END IF;
END $$;

-- Rename stripe_subscription_id → paystack_subscription_code on subscriptions table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'stripe_subscription_id'
    ) THEN
        ALTER TABLE subscriptions RENAME COLUMN stripe_subscription_id TO paystack_subscription_code;
    ELSE
        ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paystack_subscription_code TEXT;
    END IF;
END $$;
"""

_REVERT_SQL = r"""DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'paystack_customer_code'
    ) THEN
        ALTER TABLE users RENAME COLUMN paystack_customer_code TO stripe_customer_id;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'paystack_subscription_code'
    ) THEN
        ALTER TABLE users RENAME COLUMN paystack_subscription_code TO stripe_subscription_id;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'paystack_subscription_code'
    ) THEN
        ALTER TABLE subscriptions
            RENAME COLUMN paystack_subscription_code TO stripe_subscription_id;
    END IF;
END $$;
"""


def upgrade() -> None:
    """Rename Stripe billing columns to their Paystack equivalents."""
    run_sql_script(_PAYSTACK_SQL)


def downgrade() -> None:
    """Reverse the rename; no-op when the Paystack columns are absent."""
    run_sql_script(_REVERT_SQL)

