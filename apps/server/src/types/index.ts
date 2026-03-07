// ──────────────────────────────────────────────
// Thravic Server — Shared TypeScript Types
// ──────────────────────────────────────────────
// Centralised type definitions used across routes,
// middleware, and services.  Import from
// '../types' instead of re-declaring inline.
// ──────────────────────────────────────────────

// ── Auth / User ─────────────────────────────
export interface User {
    id: string;
    email: string;
    password: string;
    name: string;
    createdAt: Date;
    subscription: 'free' | 'pro' | 'agency';
}

// ── Domain ──────────────────────────────────
export interface DomainSettings {
    trackClicks: boolean;
    trackScrolls: boolean;
    trackForms: boolean;
    sessionRecording: boolean;
    heatmaps: boolean;
}

export interface Domain {
    id: string;
    userId: string;
    domain: string;
    trackingId: string;
    name: string;
    verified: boolean;
    createdAt: Date;
    settings: DomainSettings;
}

// ── Events ──────────────────────────────────
export type EventType = 'pageview' | 'click' | 'scroll' | 'form' | 'custom';
export type SourceType = 'direct' | 'organic' | 'paid' | 'social' | 'referral' | 'email';

export interface TrackingEvent {
    id: string;
    trackingId: string;
    type: EventType;
    timestamp: Date;
    visitorId: string;
    sessionId: string;
    url: string;
    referrer: string | null;

    // UTM Parameters
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmTerm: string | null;
    utmContent: string | null;

    // Device Info
    userAgent: string;
    screenWidth: number | null;
    screenHeight: number | null;
    language: string | null;

    // Event-specific data
    data: Record<string, unknown>;
}

// ── Sessions ────────────────────────────────
export interface Session {
    id: string;
    visitorId: string;
    trackingId: string;
    startedAt: Date;
    lastActivity: Date;
    pageviews: number;
    source: string | null;
    sourceType: SourceType;
    entryPage?: string;
    exitPage?: string;
}

// ── Funnels ─────────────────────────────────
export interface FunnelStep {
    id: string;
    name: string;
    type: 'pageview' | 'click' | 'custom';
    condition: {
        field: string;
        operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
        value: string;
    };
    order: number;
}

export interface Funnel {
    id: string;
    domainId: string;
    name: string;
    description: string;
    steps: FunnelStep[];
    createdAt: Date;
    updatedAt: Date;
}

// ── Heatmaps ────────────────────────────────
export type ViewportType = 'desktop' | 'mobile' | 'tablet';

export interface HeatmapPoint {
    x: number;
    y: number;
    count: number;
}

export interface HeatmapData {
    id: string;
    domainId: string;
    pageUrl: string;
    pagePath: string;
    type: 'click' | 'scroll';
    viewport: ViewportType;
    points: HeatmapPoint[];
    totalInteractions: number;
    uniqueVisitors: number;
    updatedAt: Date;
}

// ── Session Recordings ──────────────────────
export type RecordingEventType = 'mousemove' | 'click' | 'scroll' | 'input' | 'resize' | 'pageview';

export interface RecordingEvent {
    type: RecordingEventType;
    timestamp: number; // Relative to session start
    data: Record<string, any>;
}

export interface SessionRecording {
    id: string;
    domainId: string;
    trackingId: string;
    visitorId: string;
    sessionId: string;
    startedAt: Date;
    endedAt: Date | null;
    duration: number; // in seconds
    pageUrl: string;
    pagePath: string;
    userAgent: string;
    screenWidth: number;
    screenHeight: number;
    events: RecordingEvent[];
    eventCount: number;
    status: 'recording' | 'completed' | 'processing';
}

// ── AI Insights ─────────────────────────────
export type InsightType = 'trend' | 'anomaly' | 'performance' | 'opportunity' | 'warning';
export type Priority = 'high' | 'medium' | 'low';

export interface Insight {
    id: string;
    type: InsightType;
    priority: Priority;
    title: string;
    description: string;
    metric: string;
    value: number | string;
    change?: number;
    recommendation?: string;
    createdAt: Date;
}
