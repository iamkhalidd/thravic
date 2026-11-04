"""Experiment results

Revision ID: 0033_experiment_results
Revises: 0032_visitor_models
Create Date: 2026-11-04

What an A/B test needs beyond its versions:

* ``key``: the name the site asks for, as in ``TF('variant', 'checkout-button')``,
  unique per site. Existing experiments get one from their name.
* ``goal_event``: the custom event that counts as a conversion.
* ``started_at`` / ``ended_at``: only visitors who saw a version in between,
  and goals reached after they saw it, are counted.
* ``result``: the latest numbers from the daily check (``jobs/experiment_check``);
  ``decided_at`` is when it first called a winner, ``alerted_at`` when the
  owner was told.

The partial index finds who saw an experiment (``experiment_view`` events)
without reading the site's other events.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0033_experiment_results"
down_revision = "0032_visitor_models"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE experiments
    ADD COLUMN IF NOT EXISTS key VARCHAR(100),
    ADD COLUMN IF NOT EXISTS goal_event TEXT,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS result JSONB,
    ADD COLUMN IF NOT EXISTS decided_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMP WITH TIME ZONE;

UPDATE experiments e SET key = named.key
FROM (
    SELECT id,
           CASE WHEN ROW_NUMBER() OVER (PARTITION BY domain_id, slug ORDER BY created_at) = 1
                THEN slug ELSE slug || '-' || LEFT(id::text, 6) END AS key
    FROM (
        SELECT id, domain_id, created_at,
               COALESCE(NULLIF(LEFT(TRIM(BOTH '-' FROM
                   regexp_replace(LOWER(name), '[^a-z0-9]+', '-', 'g')), 80), ''),
                   'experiment') AS slug
        FROM experiments
    ) slugs
) named
WHERE e.id = named.id AND e.key IS NULL;

UPDATE experiments SET started_at = created_at
WHERE started_at IS NULL AND status IN ('active', 'ended');
UPDATE experiments SET ended_at = updated_at WHERE ended_at IS NULL AND status = 'ended';

CREATE UNIQUE INDEX IF NOT EXISTS idx_experiments_domain_key ON experiments(domain_id, key);

CREATE INDEX IF NOT EXISTS idx_events_experiment_view
    ON events(domain_id, (data->>'experiment'), created_at)
    WHERE type = 'custom' AND data->>'event' = 'experiment_view';
"""

_DOWNGRADE_SQL = r"""DROP INDEX IF EXISTS idx_events_experiment_view;
DROP INDEX IF EXISTS idx_experiments_domain_key;
ALTER TABLE experiments
    DROP COLUMN IF EXISTS alerted_at,
    DROP COLUMN IF EXISTS decided_at,
    DROP COLUMN IF EXISTS result,
    DROP COLUMN IF EXISTS ended_at,
    DROP COLUMN IF EXISTS started_at,
    DROP COLUMN IF EXISTS goal_event,
    DROP COLUMN IF EXISTS key;
"""


def upgrade() -> None:
    """Add the goal, dates, key and results to experiments."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Remove them."""
    run_sql_script(_DOWNGRADE_SQL)
