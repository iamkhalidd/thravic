"""Bigger plan limits and a monthly recording quota

Revision ID: 0025_plan_limits
Revises: 0024_insight_periods
Create Date: 2026-10-28

* ``plans.recordings_per_day`` becomes ``recordings_per_month``, counted over the
  same allowance window as events (``plan_service.current_window``).
* New limits: Hobby 50k events and 100 recordings a month, with heatmaps and
  recordings; Pro 250k events, 5 sites, 1,000 recordings; Agency 1M events,
  25 sites, 5,000 recordings. Prices are unchanged.
* The free plan's retention policy said 7 days while the plan promises 30; it
  now keeps everything for 30 days.

Admins can still change any of these in the admin Plans page; this only sets
the starting values. The downgrade restores the previous ones.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0025_plan_limits"
down_revision = "0024_insight_periods"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE plans RENAME COLUMN recordings_per_day TO recordings_per_month;

UPDATE plans SET events_limit = 50000, recordings_per_month = 100,
    features = ARRAY(SELECT DISTINCT unnest(features || ARRAY['heatmaps', 'recordings'])),
    updated_at = NOW()
WHERE id = 'free';

UPDATE plans SET events_limit = 250000, domains_limit = 5, recordings_per_month = 1000,
    updated_at = NOW()
WHERE id = 'pro';

UPDATE plans SET events_limit = 1000000, domains_limit = 25, recordings_per_month = 5000,
    updated_at = NOW()
WHERE id = 'agency';

UPDATE data_retention_policies
SET events_days = 30, sessions_days = 30, recordings_days = 30, heatmaps_days = 30
WHERE plan = 'free';
"""

_DOWNGRADE_SQL = r"""UPDATE data_retention_policies
SET events_days = 7, sessions_days = 7, recordings_days = 7, heatmaps_days = 7
WHERE plan = 'free';

UPDATE plans SET events_limit = 500000, domains_limit = 20, recordings_per_month = 25
WHERE id = 'agency';

UPDATE plans SET events_limit = 100000, domains_limit = 3, recordings_per_month = 10
WHERE id = 'pro';

UPDATE plans SET events_limit = 4000, recordings_per_month = NULL,
    features = ARRAY(SELECT f FROM unnest(features) AS f WHERE f NOT IN ('heatmaps', 'recordings'))
WHERE id = 'free';

ALTER TABLE plans RENAME COLUMN recordings_per_month TO recordings_per_day;
"""


def upgrade() -> None:
    """Rename the recording quota and set the new limits."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Restore the daily quota and the previous limits."""
    run_sql_script(_DOWNGRADE_SQL)
