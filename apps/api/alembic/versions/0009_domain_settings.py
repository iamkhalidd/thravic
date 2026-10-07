"""Store per-domain tracking settings

Revision ID: 0009_domain_settings
Revises: 0008_users_suspended_role
Create Date: 2026-10-07

``PATCH /api/domains/{id}/settings`` validated its body and echoed it back, but
nothing was stored ("the domains table has no settings column"), so every toggle
reset on reload. Settings now live in ``domains.settings`` and are served to the
tracker by ``GET /api/collect/{trackingId}/config``.

Only overrides are stored; missing keys take the defaults in
``domain_service.DEFAULT_SETTINGS`` (session recording off, everything else on).

Backfill: session recording was switched on in the customer's page
(``window.__TF_CONFIG__``) and the server never checked it. The server now refuses
recordings for domains with it off, so domains that recorded in the last 30 days
start with it on, rather than going dark on deploy.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0009_domain_settings"
down_revision = "0008_users_suspended_role"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE domains
    ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE domains d
SET settings = d.settings || '{"sessionRecording": true}'::jsonb
WHERE EXISTS (
    SELECT 1 FROM session_recordings r
    WHERE r.domain_id = d.id AND r.started_at >= NOW() - INTERVAL '30 days'
);
"""

_DOWNGRADE_SQL = r"""ALTER TABLE domains DROP COLUMN IF EXISTS settings;
"""


def upgrade() -> None:
    """Add domains.settings and keep recording on where it is in use."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop domains.settings."""
    run_sql_script(_DOWNGRADE_SQL)
