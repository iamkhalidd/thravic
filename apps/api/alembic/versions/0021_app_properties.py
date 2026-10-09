"""Let a property be a mobile app as well as a website

Revision ID: 0021_app_properties
Revises: 0020_notification_log
Create Date: 2026-10-09

``domains.platform`` says what a property is: 'web' (every existing row), 'ios',
'android' or 'cross' (one app on both). An app keeps its bundle ID
(``com.acme.shop``) in ``domains.domain``, so ``UNIQUE(user_id, domain)`` and the
tracking-ID lookup work unchanged.

Apps send screen views as ordinary ``pageview`` events whose ``url`` is
``app://<bundle id>/<Screen>``, so pages, paths, funnels and retention need no
new event type. What a browser user-agent gives a website, the app SDK reports
itself: ``sessions.os``, ``os_version``, ``app_version`` and ``device_model``.
They stay NULL for websites.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0021_app_properties"
down_revision = "0020_notification_log"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""ALTER TABLE domains
    ADD COLUMN IF NOT EXISTS platform VARCHAR(20) NOT NULL DEFAULT 'web';
ALTER TABLE domains DROP CONSTRAINT IF EXISTS domains_platform_check;
ALTER TABLE domains ADD CONSTRAINT domains_platform_check
    CHECK (platform IN ('web', 'ios', 'android', 'cross'));

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS os VARCHAR(50);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS os_version VARCHAR(50);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS app_version VARCHAR(50);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_model VARCHAR(100);
"""

_DOWNGRADE_SQL = r"""ALTER TABLE sessions DROP COLUMN IF EXISTS device_model;
ALTER TABLE sessions DROP COLUMN IF EXISTS app_version;
ALTER TABLE sessions DROP COLUMN IF EXISTS os_version;
ALTER TABLE sessions DROP COLUMN IF EXISTS os;

ALTER TABLE domains DROP CONSTRAINT IF EXISTS domains_platform_check;
ALTER TABLE domains DROP COLUMN IF EXISTS platform;
"""


def upgrade() -> None:
    """Add domains.platform and the app device columns on sessions."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop the app columns."""
    run_sql_script(_DOWNGRADE_SQL)
