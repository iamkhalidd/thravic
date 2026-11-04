"""Visitor models

Revision ID: 0032_visitor_models
Revises: 0031_bot_filtering
Create Date: 2026-11-04

* ``site_models``: what the nightly job (``jobs/visitor_models``) learned for
  each site, one row per kind: ``conversion`` (the logistic regression for the
  site's conversion event, named in ``target``) and ``churn`` (the site's usual
  gap between a returning visitor's visits). Visitors are scored with these
  when the dashboard asks; scores themselves are not stored.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0032_visitor_models"
down_revision = "0031_bot_filtering"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""CREATE TABLE IF NOT EXISTS site_models (
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,
    target TEXT,
    model JSONB NOT NULL,
    fitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (domain_id, kind)
);
"""

_DOWNGRADE_SQL = r"""DROP TABLE IF EXISTS site_models;
"""


def upgrade() -> None:
    """Create the site models table."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop it."""
    run_sql_script(_DOWNGRADE_SQL)
