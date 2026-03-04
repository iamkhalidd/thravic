// ──────────────────────────────────────────────
// TrackFlow Web — Shared TypeScript Types
// ──────────────────────────────────────────────
// Centralised type definitions used across pages,
// contexts, and the API client.  Import from
// '@/types' instead of re-declaring inline.
// ──────────────────────────────────────────────

// ── Domain ──────────────────────────────────
export interface Domain {
    id: string;
    domain: string;
    name: string;
    trackingId: string;
    verified: boolean;
    createdAt?: string;
    settings?: DomainSettings;
}

export interface DomainSettings {
    trackClicks: boolean;
    trackScrolls: boolean;
    trackForms: boolean;
    sessionRecording: boolean;
    heatmaps: boolean;
}

// ── Analytics / Dashboard ───────────────────
export interface Metrics {
    pageviews: number;
    uniqueVisitors: number;
    sessions: number;
    bounceRate: number;
    avgSessionDuration: number;
}

export interface TopPage {
    path: string;
    views: number;
}

export interface TimeseriesData {
    date: string;
    pageviews: number;
    visitors: number;
}

export interface RealtimeData {
    activeVisitors: number;
    pageviewsLast30Min: number;
    activePages: Array<{ path: string; count: number }>;
}

// ── Traffic Sources ─────────────────────────
export interface SourceData {
    type: string;
    count: number;
}

export interface SourceBreakdown {
    direct: number;
    organic: number;
    social: number;
    referral: number;
    paid: number;
    email: number;
}

// ── Funnels ─────────────────────────────────
export interface FunnelStep {
    name: string;
    url: string;
    type?: 'pageview' | 'event' | 'click';
    matchType?: 'exact' | 'contains' | 'regex';
}

export interface Funnel {
    id: string;
    domainId: string;
    name: string;
    description?: string;
    steps: FunnelStep[];
    createdAt?: string;
}

// ── Heatmaps ────────────────────────────────
export interface HeatmapPoint {
    x: number;
    y: number;
    count: number;
    scrollDepth?: number;
}

// ── Session Recordings ──────────────────────
export interface SessionRecording {
    id: string;
    url: string;
    duration: number;
    eventsCount: number;
    startedAt: string;
    endedAt?: string;
}

// ── Auth / User ─────────────────────────────
export interface User {
    id: string;
    email: string;
    name: string;
    subscription: 'free' | 'pro' | 'agency';
    createdAt?: string;
}

// ── API Response ────────────────────────────
export interface ApiResponse<T> {
    data?: T;
    error?: string;
}
