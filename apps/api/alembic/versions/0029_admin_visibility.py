"""Admin visibility: job failures, an email log, AI usage and Shopify traffic

Revision ID: 0029_admin_visibility
Revises: 0028_agency_toolkit
Create Date: 2026-10-30

``job_runs`` gains ``last_error`` and ``last_error_at``: a run that raises is
recorded there (its ``last_run_at`` stays at the last run that worked), so the
admin's job panel can say a job is failing, not just late.

``email_log`` is one row per email Thravic tried to send: who to, the subject,
which template (``kind``) and whether the provider took it. ``user_id`` is the
account with that address at send time, so the rows go when the account does.
Rows older than 90 days are removed by the ``log_cleanup`` job.

``ai_usage`` is one row per call to the AI model: which feature asked, for
which site and owner, and the tokens the provider reported. The admin's AI page
turns the tokens into an estimated cost. Rows older than 400 days are removed.

``daily_domain_stats.shopify_events`` counts the events the Thravic Shopify app's
pixel sent that day (their ``event_id`` starts with ``shopify-``), so the admin
can list the stores using the app without scanning ``events``.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0029_admin_visibility"
down_revision = "0028_agency_toolkit"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMP WITH TIME ZONE;
-- A job that has only ever failed has no successful run yet.
ALTER TABLE job_runs ALTER COLUMN last_run_at DROP NOT NULL;

CREATE TABLE IF NOT EXISTS email_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    kind VARCHAR(40) NOT NULL DEFAULT 'other',
    status VARCHAR(10) NOT NULL,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_log_user_time ON email_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_time ON email_log (created_at);

CREATE TABLE IF NOT EXISTS ai_usage (
    id BIGSERIAL PRIMARY KEY,
    feature VARCHAR(20) NOT NULL,
    domain_id UUID REFERENCES domains(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    ok BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_time ON ai_usage (created_at);

ALTER TABLE daily_domain_stats ADD COLUMN IF NOT EXISTS shopify_events INTEGER NOT NULL DEFAULT 0;
"""

_DOWNGRADE_SQL = r"""ALTER TABLE daily_domain_stats DROP COLUMN IF EXISTS shopify_events;
DROP TABLE IF EXISTS ai_usage;
DROP TABLE IF EXISTS email_log;
DELETE FROM job_runs WHERE last_run_at IS NULL;
ALTER TABLE job_runs ALTER COLUMN last_run_at SET NOT NULL;
ALTER TABLE job_runs DROP COLUMN IF EXISTS last_error_at;
ALTER TABLE job_runs DROP COLUMN IF EXISTS last_error;
"""


def upgrade() -> None:
    """Add job failures, email_log, ai_usage and daily Shopify counts."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Remove them."""
    run_sql_script(_DOWNGRADE_SQL)
