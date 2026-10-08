"""Paid plans end when their period does

Revision ID: 0015_subscription_periods
Revises: 0014_plan_catalog
Create Date: 2026-10-08

Access used to follow ``subscriptions.status = 'active'`` alone. A payment set a
30-day ``current_period_end`` that nothing read, so one payment granted the plan
for good. Access is now decided from the period (see ``plan_service.entitled``):
the plan lasts until ``current_period_end`` plus a 3-day grace period.

* ``payment_history.paystack_ref`` becomes unique: ``/verify`` and the webhook
  both report the same payment, and since a renewal now extends the period, each
  payment must be applied exactly once.
* ``subscription_notices`` records which reminder emails went out for which
  period, so each is sent once.
* ``payment_history.user_id`` is set NULL when the user is deleted: the
  payment record outlives the account, and before this deleting any user who
  had opened checkout failed on the foreign key.
* Paid subscriptions whose access would end within 7 days of this deploy (their
  period had already run out unnoticed) get until then, so the renewal reminder
  reaches them before anything changes.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0015_subscription_periods"
down_revision = "0014_plan_catalog"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE payment_history ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE payment_history DROP CONSTRAINT IF EXISTS payment_history_user_id_fkey;
ALTER TABLE payment_history ADD CONSTRAINT payment_history_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_history_paystack_ref_unique
    ON payment_history (paystack_ref);

CREATE TABLE IF NOT EXISTS subscription_notices (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    kind       VARCHAR(40) NOT NULL,
    sent_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, period_end, kind)
);

-- Ends + 3 grace days = 7 days from now.
UPDATE subscriptions
SET current_period_end = NOW() + INTERVAL '4 days', updated_at = NOW()
WHERE status = 'active'
  AND plan <> 'free'
  AND current_period_end IS NOT NULL
  AND current_period_end < NOW() + INTERVAL '4 days';
"""

_DOWNGRADE_SQL = r"""DROP TABLE IF EXISTS subscription_notices;
DROP INDEX IF EXISTS payment_history_paystack_ref_unique;
"""


def upgrade() -> None:
    """Unique payment references, kept payment records, reminder log, 7-day runway."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop the reminder log and the unique index (the FK and runway stay)."""
    run_sql_script(_DOWNGRADE_SQL)
