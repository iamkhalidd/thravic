-- TrackFlow Analytics - PostgreSQL Schema
-- Following MVP Spec: Database & Models

-- Users & Authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    subscription VARCHAR(50) DEFAULT 'free' CHECK (subscription IN ('free', 'growth', 'pro', 'enterprise')),
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Domains (Multi-domain support)
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

-- Visitors (Unique visitor records)
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

-- Sessions
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
    source_type VARCHAR(50) CHECK (source_type IN ('direct', 'organic', 'paid', 'social', 'referral', 'email')),
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
    
    UNIQUE(session_id, domain_id)
);

-- Events (Raw event data)
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

-- Funnels (Custom funnel definitions)
CREATE TABLE IF NOT EXISTS funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Funnel Steps
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

-- Heatmap Data (Aggregated click/scroll data)
CREATE TABLE IF NOT EXISTS heatmap_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    url_path VARCHAR(500) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('click', 'scroll')),
    
    -- Position data
    x INTEGER,
    y INTEGER,
    scroll_depth INTEGER,
    
    -- Viewport
    viewport_width INTEGER,
    viewport_height INTEGER,
    
    -- Count for aggregation
    count INTEGER DEFAULT 1,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Session Recordings (Compressed session recordings)
CREATE TABLE IF NOT EXISTS session_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    
    url TEXT NOT NULL,
    duration INTEGER, -- in seconds
    events_count INTEGER,
    
    -- Compressed recording data
    recording_data JSONB,
    
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE
);

-- Subscriptions (SaaS subscription management)
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(255),
    plan VARCHAR(50) NOT NULL CHECK (plan IN ('free', 'growth', 'pro', 'enterprise')),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
    
    -- Usage limits
    events_limit INTEGER NOT NULL,
    domains_limit INTEGER NOT NULL,
    
    -- Current usage
    events_used INTEGER DEFAULT 0,
    
    -- Billing
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage Logs (for metering)
CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- First day of the month
    events_count INTEGER DEFAULT 0,
    
    UNIQUE(domain_id, month)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_domain_created ON events(domain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_sessions_domain_started ON sessions(domain_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_source_type ON sessions(source_type);
CREATE INDEX IF NOT EXISTS idx_visitors_domain ON visitors(domain_id);
CREATE INDEX IF NOT EXISTS idx_heatmap_domain_url ON heatmap_data(domain_id, url_path);
CREATE INDEX IF NOT EXISTS idx_recordings_domain ON session_recordings(domain_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_domain_month ON usage_logs(domain_id, month);
CREATE INDEX IF NOT EXISTS idx_domains_tracking_id ON domains(tracking_id);
