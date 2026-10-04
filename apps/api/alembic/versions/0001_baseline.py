"""baseline: current schema

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-04

Baseline revision for adopting Alembic on a database that already exists.
``upgrade()`` applies the full application schema (frozen at adoption time), so a
brand-new database can be built entirely through Alembic.

Adopting on an existing database (schema already present):

    alembic stamp 0001_baseline        # mark applied, do not re-run

then ``alembic upgrade head`` to pick up anything after the baseline.
"""

from __future__ import annotations

from alembic_support import run_sql_script

# revision identifiers, used by Alembic.
revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

# Frozen snapshot of the schema at Alembic adoption. Deliberately inline and
# self-contained: a shipped baseline must never change.
_SCHEMA_SQL = r"""-- Thravic Analytics - PostgreSQL Schema
-- Tables ordered by dependency (referenced tables created first)

-- ═══════════════════════════════════════════════
-- 1. Users & Authentication
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    subscription VARCHAR(50) DEFAULT 'free' CHECK (subscription IN ('free', 'pro', 'agency')),
    paystack_customer_code VARCHAR(255),
    paystack_subscription_code VARCHAR(255),
    preferences JSONB DEFAULT '{}',
    -- OAuth fields
    auth_provider VARCHAR(20) DEFAULT 'email',
    auth_provider_id VARCHAR(255),
    -- Profile fields
    avatar_url TEXT,
    company VARCHAR(255),
    job_title VARCHAR(255),
    website VARCHAR(500),
    phone VARCHAR(50),
    country VARCHAR(100),
    timezone VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prevent duplicate OAuth accounts per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth
  ON users (auth_provider, auth_provider_id)
  WHERE auth_provider != 'email';

-- ═══════════════════════════════════════════════
-- 2. Domains (Multi-domain support)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    tracking_id VARCHAR(50) UNIQUE NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, domain)
);

-- ═══════════════════════════════════════════════
-- 3. Domain Members (Team collaboration)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS domain_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(domain_id, user_id)
);

-- ═══════════════════════════════════════════════
-- 4. Visitors (Unique visitor records)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id VARCHAR(100) NOT NULL,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_sessions INTEGER DEFAULT 0,
    total_pageviews INTEGER DEFAULT 0,
    UNIQUE(visitor_id, domain_id)
);

-- ═══════════════════════════════════════════════
-- 5. Sessions
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(100) NOT NULL,
    visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    pageviews INTEGER DEFAULT 0,

    -- Source attribution
    source VARCHAR(255),
    source_type VARCHAR(50) CHECK (source_type IN (
        'direct', 'search', 'social', 'referral', 'email',
        'ad', 'campaign', 'internal'
    )),
    referrer TEXT,

    -- UTM parameters
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    utm_term VARCHAR(255),
    utm_content VARCHAR(255),

    -- Device info
    user_agent TEXT,
    screen_width INTEGER,
    screen_height INTEGER,
    language VARCHAR(20),

    -- Geo Tracking
    country VARCHAR(2),
    city VARCHAR(100),
    region VARCHAR(100),

    UNIQUE(session_id, domain_id)
);

-- ═══════════════════════════════════════════════
-- 6. Events (Raw event data)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,

    type VARCHAR(50) NOT NULL CHECK (type IN ('pageview', 'click', 'scroll', 'form', 'custom')),
    url TEXT NOT NULL,
    referrer TEXT,

    -- UTM (denormalized for fast queries)
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),

    -- Event-specific data
    data JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 7. Funnels
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS funnel_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_id UUID NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('pageview', 'event', 'click')),
    match_type VARCHAR(50) DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'regex')),
    match_value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 8. Heatmap Data
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS heatmap_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    url_path VARCHAR(500) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('click', 'scroll')),
    x INTEGER,
    y INTEGER,
    scroll_depth INTEGER,
    viewport_width INTEGER,
    viewport_height INTEGER,
    count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 9. Session Recordings
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS session_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    duration INTEGER,
    events_count INTEGER,
    recording_data JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE
);

-- ═══════════════════════════════════════════════
-- 10. Subscriptions
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    paystack_subscription_code VARCHAR(255),
    plan VARCHAR(50) NOT NULL CHECK (plan IN ('free', 'pro', 'agency')),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
    events_limit INTEGER NOT NULL,
    domains_limit INTEGER NOT NULL,
    events_used INTEGER DEFAULT 0,
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 11. Usage Logs (Metering)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    events_count INTEGER DEFAULT 0,
    UNIQUE(domain_id, month)
);

-- ═══════════════════════════════════════════════
-- 12. Webhooks (Event notifications)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL,
    secret VARCHAR(255),
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 13. A/B Experiments
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'ended')),
    variants JSONB NOT NULL DEFAULT '[]',
    traffic_allocation INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 14. Admin Audit Log
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 15. System Settings (runtime key-value config)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 16. Data Retention Policies
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan VARCHAR(50) NOT NULL UNIQUE,
    events_days INTEGER NOT NULL,
    sessions_days INTEGER NOT NULL,
    recordings_days INTEGER NOT NULL,
    heatmaps_days INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- Add role column to users (safe: uses ADD COLUMN IF NOT EXISTS workaround)
-- ═══════════════════════════════════════════════
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin'));
    END IF;
END $$;

-- ═══════════════════════════════════════════════
-- Default system settings
-- ═══════════════════════════════════════════════
INSERT INTO system_settings (key, value) VALUES
    ('registration.enabled', 'true'::jsonb),
    ('maintenance.enabled', 'false'::jsonb),
    ('tracking.enabled', 'true'::jsonb),
    ('require_email_verification', 'false'::jsonb),
    ('feature_flags', '{"ai_insights": true, "recordings": true, "heatmaps": true, "experiments": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════
-- Default retention policies
-- ═══════════════════════════════════════════════
INSERT INTO data_retention_policies (plan, events_days, sessions_days, recordings_days, heatmaps_days) VALUES
    ('free', 30, 30, 30, 30),
    ('pro', 365, 365, 90, 365),
    ('agency', 730, 730, 365, 730)
ON CONFLICT (plan) DO NOTHING;

-- ═══════════════════════════════════════════════
-- 17. Plans (admin-managed pricing & features)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS plans (
    id              VARCHAR(50) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    price           INTEGER NOT NULL DEFAULT 0,
    currency        VARCHAR(3) NOT NULL DEFAULT 'NGN',
    interval        VARCHAR(20) DEFAULT 'monthly' CHECK (interval IN ('monthly', 'yearly')),
    events_limit    INTEGER NOT NULL,
    domains_limit   INTEGER NOT NULL,
    retention_days  INTEGER NOT NULL DEFAULT 30,
    features        TEXT[] NOT NULL DEFAULT '{}',
    active          BOOLEAN DEFAULT TRUE,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO plans (id, name, price, currency, events_limit, domains_limit, retention_days, features, sort_order) VALUES
    ('free', 'Hobby', 0, 'NGN', 5000, 1, 30, ARRAY['analytics','realtime','utm'], 0),
    ('pro', 'Pro', 45000, 'NGN', 100000, 3, 365, ARRAY['analytics','realtime','utm','heatmaps','insights','export','funnels','recordings','experiments','webhooks','team'], 1),
    ('agency', 'Agency', 125000, 'NGN', 500000, 20, 730, ARRAY['analytics','realtime','utm','heatmaps','insights','export','funnels','recordings','experiments','webhooks','team'], 2)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════
-- 18. Promo Codes (admin-managed discounts)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS promo_codes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(50) UNIQUE NOT NULL,
    discount_type   VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
    discount_value  INTEGER NOT NULL,
    applicable_plans TEXT[] DEFAULT '{}',
    max_uses        INTEGER,
    max_per_user    INTEGER DEFAULT 1,
    used_count      INTEGER DEFAULT 0,
    starts_at       TIMESTAMP WITH TIME ZONE,
    expires_at      TIMESTAMP WITH TIME ZONE,
    active          BOOLEAN DEFAULT TRUE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id   UUID NOT NULL REFERENCES promo_codes(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    plan            VARCHAR(50) NOT NULL,
    original_amount INTEGER NOT NULL,
    discounted_amount INTEGER NOT NULL,
    paystack_ref    VARCHAR(255),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 19. Payment History (immutable ledger)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payment_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    plan            VARCHAR(50) NOT NULL,
    amount          INTEGER NOT NULL,
    currency        VARCHAR(3) NOT NULL DEFAULT 'NGN',
    promo_code_id   UUID REFERENCES promo_codes(id),
    paystack_ref    VARCHAR(255),
    status          VARCHAR(50) DEFAULT 'success',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- Indexes (single block, no duplicates)
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_domains_tracking_id ON domains(tracking_id);
CREATE INDEX IF NOT EXISTS idx_sessions_domain_started ON sessions(domain_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_source_type ON sessions(source_type);
CREATE INDEX IF NOT EXISTS idx_events_domain_created ON events(domain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_visitors_domain ON visitors(domain_id);
CREATE INDEX IF NOT EXISTS idx_heatmap_domain_url ON heatmap_data(domain_id, url_path);
CREATE INDEX IF NOT EXISTS idx_recordings_domain ON session_recordings(domain_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_domain_month ON usage_logs(domain_id, month);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
"""


def upgrade() -> None:
    """Apply the baseline schema."""
    run_sql_script(_SCHEMA_SQL)


def downgrade() -> None:
    """The baseline is a point-in-time snapshot and is not reversible."""
    raise NotImplementedError(
        "The baseline cannot be downgraded. Restore from a backup instead."
    )

