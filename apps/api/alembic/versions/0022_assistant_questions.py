"""Count questions asked to the Ask Thravic assistant

Revision ID: 0022_assistant_questions
Revises: 0021_app_properties
Create Date: 2026-10-15

One row per answered question, so each user's daily limit can be counted.
Only who asked, about which site and when are stored, never the question or
the answer. Rows go with their user or site.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0022_assistant_questions"
down_revision = "0021_app_properties"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""CREATE TABLE IF NOT EXISTS assistant_questions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assistant_questions_user_time
    ON assistant_questions (user_id, created_at);
"""

_DOWNGRADE_SQL = r"""DROP TABLE IF EXISTS assistant_questions;
"""


def upgrade() -> None:
    """Add assistant_questions."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop assistant_questions."""
    run_sql_script(_DOWNGRADE_SQL)
