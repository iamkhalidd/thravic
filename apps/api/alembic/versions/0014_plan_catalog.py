"""Make the plans table the one definition of each plan

Revision ID: 0014_plan_catalog
Revises: 0013_insight_reports
Create Date: 2026-10-08

The admin Plans page edited ``plans``, but limits and features were enforced
from constants in ``app/plans.py`` and the landing page's bullets were
hard-coded, so edits changed little beyond the price. Everything now reads
``plans`` (see ``plan_catalog``). This adds what the rest needed:

* ``team_limit`` / ``recordings_per_day`` — new limits; NULL means unlimited,
  which is today's behaviour, so nothing changes until an admin sets them.
* ``tagline``, ``extra_features``, ``badge``, ``show_on_landing`` — the pricing
  card's own copy. The bullets about limits and features are generated from
  the plan itself; ``extra_features`` are lines the admin adds to them.

The CHECK constraints that listed plan ids (``free``/``pro``/``agency``...) are
dropped: plan ids are now whatever the admin creates, and a plan bought outside
that list could not be stored. Every plan also gets a retention policy row;
without one, the retention job skipped that plan's sites entirely.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0014_plan_catalog"
down_revision = "0013_insight_reports"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS team_limit INTEGER,
    ADD COLUMN IF NOT EXISTS recordings_per_day INTEGER,
    ADD COLUMN IF NOT EXISTS tagline VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS extra_features TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS badge VARCHAR(40) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS show_on_landing BOOLEAN NOT NULL DEFAULT TRUE;

-- The copy the landing page had hard-coded, so it reads the same until edited.
UPDATE plans SET tagline = 'For personal projects' WHERE id = 'free' AND tagline = '';
UPDATE plans SET tagline = 'For startups & businesses', badge = 'Most popular'
    WHERE id = 'pro' AND tagline = '';
UPDATE plans SET tagline = 'For agencies & scale', extra_features = ARRAY['Priority support']
    WHERE id = 'agency' AND tagline = '';

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_subscription_check;

INSERT INTO data_retention_policies (plan, events_days, sessions_days, recordings_days, heatmaps_days)
SELECT p.id, f.events_days, f.sessions_days, f.recordings_days, f.heatmaps_days
FROM plans p
CROSS JOIN (SELECT * FROM data_retention_policies WHERE plan = 'free') f
WHERE NOT EXISTS (SELECT 1 FROM data_retention_policies r WHERE r.plan = p.id);
"""

_DOWNGRADE_SQL = r"""ALTER TABLE plans
    DROP COLUMN IF EXISTS show_on_landing,
    DROP COLUMN IF EXISTS badge,
    DROP COLUMN IF EXISTS extra_features,
    DROP COLUMN IF EXISTS tagline,
    DROP COLUMN IF EXISTS recordings_per_day,
    DROP COLUMN IF EXISTS team_limit;
"""


def upgrade() -> None:
    """Add plan limits and pricing-card copy; free plan ids from fixed lists."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop the added plan columns (the dropped CHECKs are not restored)."""
    run_sql_script(_DOWNGRADE_SQL)
