"""Agency toolkit: white-label branding, client reports and share links

Revision ID: 0028_agency_toolkit
Revises: 0027_phase2
Create Date: 2026-10-28

``agency_brands`` holds one brand per user: the name, colour and logo their
client reports and share links carry. The logo is stored here (small PNG,
re-encoded on upload) and served at ``/api/share/brand-logo/{logo_key}``; the
key changes with every upload so it can be cached.

``client_report_settings`` is a site's monthly report: who gets it and whether
it is on. ``last_period_key`` claims a month before sending, so a run that
overlaps another cannot send it twice. ``client_reports`` keeps what each report
said (``data``), for the share link's "latest report" and the overview.

``share_links`` are read-only client links. Only the SHA-256 of the token is
kept; the token itself is shown once, when the link is made.

The Agency plan gets the ``client_reports``, ``client_links`` and
``client_overview`` features.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0028_agency_toolkit"
down_revision = "0027_phase2"
branch_labels = None
depends_on = None

_UPGRADE_SQL = r"""CREATE TABLE IF NOT EXISTS agency_brands (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL DEFAULT '',
    color VARCHAR(7) NOT NULL DEFAULT '#111827',
    logo BYTEA,
    logo_key VARCHAR(32) UNIQUE,
    show_powered_by BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_report_settings (
    domain_id UUID PRIMARY KEY REFERENCES domains(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    recipients TEXT[] NOT NULL DEFAULT '{}',
    last_period_key VARCHAR(10),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    period_key VARCHAR(10) NOT NULL,
    trigger VARCHAR(10) NOT NULL,
    recipients INTEGER NOT NULL DEFAULT 0,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_reports_domain_sent ON client_reports(domain_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    label VARCHAR(80) NOT NULL DEFAULT '',
    allow_recordings BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_share_links_domain ON share_links(domain_id, created_at DESC);

UPDATE plans
SET features = ARRAY(SELECT DISTINCT unnest(
    features || ARRAY['client_reports', 'client_links', 'client_overview']
))
WHERE id = 'agency';
"""

_DOWNGRADE_SQL = r"""UPDATE plans
SET features = ARRAY(
    SELECT f FROM unnest(features) AS f
    WHERE f NOT IN ('client_reports', 'client_links', 'client_overview')
);
DROP TABLE IF EXISTS share_links;
DROP TABLE IF EXISTS client_reports;
DROP TABLE IF EXISTS client_report_settings;
DROP TABLE IF EXISTS agency_brands;
"""


def upgrade() -> None:
    """Create the agency toolkit tables and give the Agency plan its features."""
    run_sql_script(_UPGRADE_SQL)


def downgrade() -> None:
    """Drop them and take the features back."""
    run_sql_script(_DOWNGRADE_SQL)
