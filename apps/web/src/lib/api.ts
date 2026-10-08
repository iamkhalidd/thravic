import type { UsageMeter } from './usage';

/** Required at sign-up besides name, email and password (see lib/profile.ts). */
export interface SignupProfile {
    date_of_birth: string;
    country: string;
    phone: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiResponse<T> {
    data?: T;
    error?: string;
    /** The error response's body, for fields beyond `error` (e.g. `field`, `restricted`). */
    details?: Record<string, unknown>;
}

// Get stored tokens
function getTokens() {
    if (typeof window === 'undefined') return { accessToken: null, refreshToken: null };
    return {
        accessToken: localStorage.getItem('accessToken'),
        refreshToken: localStorage.getItem('refreshToken')
    };
}

// Store tokens
function setTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
}

// Clear tokens
function clearTokens() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
}

// API request helper
async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const { accessToken } = getTokens();

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options.headers as Record<string, string>
    };

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            // Try to refresh token on 401
            if (response.status === 401 && getTokens().refreshToken) {
                const refreshed = await refreshToken();
                if (refreshed) {
                    // Retry the request
                    return apiRequest(endpoint, options);
                }
            }
            return { error: data.error || 'Request failed', details: data };
        }

        return { data };
    } catch (error) {
        return { error: 'Network error' };
    }
}

// Refresh access token
async function refreshToken(): Promise<boolean> {
    const { refreshToken: token } = getTokens();
    if (!token) return false;

    try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: token })
        });

        if (!response.ok) {
            clearTokens();
            return false;
        }

        const data = await response.json();
        setTokens(data.accessToken, data.refreshToken);
        return true;
    } catch {
        clearTokens();
        return false;
    }
}

// Auth API
export const auth = {
    async register(email: string, password: string, name: string, profile: SignupProfile) {
        const result = await apiRequest<{
            user: { id: string; email: string; name: string; subscription: string };
            accessToken: string;
            refreshToken: string;
        }>('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name, ...profile })
        });

        if (result.data) {
            setTokens(result.data.accessToken, result.data.refreshToken);
        }

        return result;
    },

    async login(email: string, password: string) {
        const result = await apiRequest<{
            user: { id: string; email: string; name: string; subscription: string };
            accessToken: string;
            refreshToken: string;
        }>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (result.data) {
            setTokens(result.data.accessToken, result.data.refreshToken);
        }

        return result;
    },

    /** Forget this browser's session without calling the API (e.g. the account is gone). */
    clearSession() {
        clearTokens();
    },

    async logout() {
        const { refreshToken: token } = getTokens();
        await apiRequest('/api/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ refreshToken: token })
        });
        clearTokens();
    },

    async getMe() {
        return apiRequest<{
            id: string;
            email: string;
            name: string;
            subscription: string;
            auth_provider: string;
            avatar_url: string;
            company: string | null;
            job_title: string | null;
            website: string | null;
            phone: string | null;
            country: string | null;
            timezone: string | null;
            date_of_birth: string | null;
            profile_complete: boolean;
            missing_fields: string[];
            restricted: string | null;
        }>('/api/auth/me');
    },

    async updateProfile(data: {
        name?: string;
        company?: string;
        job_title?: string;
        website?: string;
        phone?: string;
        country?: string;
        timezone?: string;
        date_of_birth?: string;
        preferences?: Record<string, any>;
    }) {
        return apiRequest('/api/auth/me', {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    async uploadAvatar(base64Image: string) {
        return apiRequest<{ avatar_url: string }>('/api/auth/avatar', {
            method: 'POST',
            body: JSON.stringify({ image: base64Image })
        });
    },

    async removeAvatar() {
        return apiRequest<{ avatar_url: string }>('/api/auth/avatar', {
            method: 'DELETE'
        });
    },

    isAuthenticated() {
        return !!getTokens().accessToken;
    },

    async forgotPassword(email: string) {
        return apiRequest<{ message: string }>('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    },

    async resetPassword(token: string, password: string) {
        return apiRequest<{ message: string }>('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, password })
        });
    }
};

// What the collector stores for a domain, and what the tracker is told to send
// (GET /api/collect/{trackingId}/config). Session recording also needs Pro.
export interface DomainSettings {
    trackClicks: boolean;
    trackScrolls: boolean;
    trackForms: boolean;
    sessionRecording: boolean;
    /** Ask each visitor before recording (the tracker's prompt). */
    recordingConsentPrompt: boolean;
    /** Percent of visits recorded: 100, 50, 25 or 10. */
    recordingSampleRate: number;
    /** Recordings started per UTC day; the server refuses more. */
    recordingDailyLimit: number;
}

export type DomainSwitch = 'trackClicks' | 'trackScrolls' | 'trackForms' | 'sessionRecording';

export const RECORDING_SAMPLE_RATES = [100, 50, 25, 10] as const;
export const RECORDING_DAILY_LIMITS = [25, 50, 100, 250, 500, 1000] as const;

// Domains API
export const domains = {
    async list() {
        return apiRequest<{
            domains: Array<{
                id: string;
                domain: string;
                name: string;
                trackingId: string;
                verified: boolean;
                features?: string[];
                isOwner?: boolean;
                paused?: boolean;
            }>;
        }>('/api/domains');
    },

    /** Make this one of the sites that keep collecting when the plan covers fewer. */
    async keepActive(id: string) {
        return apiRequest<{ success: boolean }>(`/api/domains/${id}/keep-active`, {
            method: 'POST'
        });
    },

    async create(domain: string, name?: string) {
        return apiRequest<{
            id: string;
            domain: string;
            name: string;
            trackingId: string;
            verified: boolean;
        }>('/api/domains', {
            method: 'POST',
            body: JSON.stringify({ domain, name })
        });
    },

    async get(id: string) {
        return apiRequest<{
            id: string;
            domain: string;
            name: string;
            trackingId: string;
            verified: boolean;
            settings: DomainSettings;
        }>(`/api/domains/${id}`);
    },

    async getScript(id: string) {
        return apiRequest<{
            trackingId: string;
            script: string;
            instructions: string[];
        }>(`/api/domains/${id}/script`);
    },

    async verify(id: string) {
        return apiRequest<{ verified: boolean }>(`/api/domains/${id}/verify`, {
            method: 'POST'
        });
    },

    async delete(id: string) {
        return apiRequest<{ message: string }>(`/api/domains/${id}`, {
            method: 'DELETE'
        });
    },

    /** Merge tracking switches into the domain's settings; returns the full set. */
    async updateSettings(id: string, changes: Partial<DomainSettings>) {
        return apiRequest<{ settings: DomainSettings }>(`/api/domains/${id}/settings`, {
            method: 'PATCH',
            body: JSON.stringify(changes)
        });
    }
};

/** "?start=…&end=…" for the date range, or "" without one. */
function rangeQuery(start?: string, end?: string): string {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const query = params.toString();
    return query ? `?${query}` : '';
}

// Analytics API
export const analytics = {
    async getOverview(domainId: string, start?: string, end?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            period: { start: string; end: string };
            metrics: {
                pageviews: number;
                uniqueVisitors: number;
                sessions: number;
                bounceRate: number;
                avgSessionDuration: number;
            };
            topPages: Array<{ path: string; views: number }>;
        }>(`/api/analytics/${domainId}/overview${query}`);
    },

    async getSources(domainId: string, start?: string, end?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            byType: {
                direct: number;
                organic: number;
                paid: number;
                social: number;
                referral: number;
                email: number;
            };
            topSources: Array<{ source: string; sessions: number }>;
        }>(`/api/analytics/${domainId}/sources${query}`);
    },

    async getRealtime(domainId: string) {
        return apiRequest<{
            activeVisitors: number;
            pageviewsLast30Min: number;
            activePages: Array<{ path: string; count: number }>;
        }>(`/api/analytics/${domainId}/realtime`);
    },

    async getTimeseries(domainId: string, start?: string, end?: string, interval?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        if (interval) params.set('interval', interval);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            data: Array<{
                date: string;
                pageviews: number;
                visitors: number;
            }>;
        }>(`/api/analytics/${domainId}/timeseries${query}`);
    },

    // Get complete dashboard data: totals, daily series, top pages and channels.
    async getDashboard(domainId: string, start?: string, end?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            period: { start: string; end: string };
            metrics: {
                pageviews: number;
                uniqueVisitors: number;
                sessions: number;
                bounceRate: number;
                avgSessionDuration: number;
            };
            topPages: Array<{ path: string; views: number }>;
            // One row per day, ISO dates, zero-filled across the period.
            timeseries: Array<{ date: string; pageviews: number; visitors: number; sessions: number }>;
            sources: Record<'direct' | 'organic' | 'paid' | 'social' | 'referral' | 'email', number>;
            realtime: { activeVisitors: number };
        }>(`/api/analytics/${domainId}/dashboard${query}`);
    },

    // Get top pages for behavior analytics - calls backend pages endpoint
    async getTopPages(domainId: string, start?: string, end?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            pages: Array<{
                path: string;
                pageviews: number;
                avgTime: number;
                entries: number;
                exits: number;
                bounceRate: number;
            }>;
        }>(`/api/analytics/${domainId}/pages${query}`);
    },
    // Get device, browser, and OS breakdown
    async getDevices(domainId: string, start?: string, end?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            devices: Array<{ name: string; sessions: number; percentage: number }>;
            browsers: Array<{ name: string; sessions: number; percentage: number }>;
            operatingSystems: Array<{ name: string; sessions: number; percentage: number }>;
        }>(`/api/analytics/${domainId}/devices${query}`);
    },

    // Get sequential user paths
    async getPaths(domainId: string, start?: string, end?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            period: { start: string; end: string };
            flows: Array<{ from: string; to: string; count: number; percentage: number }>;
            entries: Array<{ path: string; count: number }>;
            exits: Array<{ path: string; count: number }>;
        }>(`/api/analytics/${domainId}/paths${query}`);
    }
};

// Sources API (detailed traffic source analytics)

export const sources = {
    async getOverview(domainId: string, start?: string, end?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            period: { start: string; end: string };
            summary: {
                totalSessions: number;
                byType: {
                    direct: { count: number; percentage: number };
                    organic: { count: number; percentage: number };
                    social: { count: number; percentage: number };
                    referral: { count: number; percentage: number };
                    paid: { count: number; percentage: number };
                    email: { count: number; percentage: number };
                };
            };
            topReferrers: Array<{ site: string; sessions: number }>;
            topSocial: Array<{ platform: string; sessions: number }>;
            topCampaigns: Array<{ campaign: string; events: number }>;
        }>(`/api/sources/${domainId}/overview${query}`);
    },

    async getReferrers(domainId: string, start?: string, end?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            period: { start: string; end: string };
            referrers: Array<{
                site: string;
                visitors: number;
                sessions: number;
                pageviews: number;
                pagesPerSession: number;
            }>;
        }>(`/api/sources/${domainId}/referrers${query}`);
    },

    async getSocial(domainId: string, start?: string, end?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            period: { start: string; end: string };
            totalSocialVisitors: number;
            platforms: Array<{
                platform: string;
                visitors: number;
                sessions: number;
                bounceRate: number;
                engagement: string;
            }>;
        }>(`/api/sources/${domainId}/social${query}`);
    },

    async getSearch(domainId: string, start?: string, end?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            period: { start: string; end: string };
            totalOrganicSessions: number;
            engines: Array<{
                engine: string;
                visitors: number;
                sessions: number;
                share: number;
            }>;
        }>(`/api/sources/${domainId}/search${query}`);
    },

    async getCampaigns(domainId: string, start?: string, end?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            period: { start: string; end: string };
            totalCampaignVisitors: number;
            campaigns: Array<{
                campaign: string;
                source: string;
                medium: string;
                visitors: number;
                sessions: number;
                pageviews: number;
                pagesPerSession: number;
            }>;
        }>(`/api/sources/${domainId}/campaigns${query}`);
    }
};

// Funnels API
// Every funnel route is scoped to a domain: /api/funnels/{domainId}[/{funnelId}].
export const funnels = {
    async list(domainId: string) {
        return apiRequest<{
            funnels: Array<{
                id: string;
                name: string;
                description: string | null;
                stepsCount: number;
                createdAt: string;
                updatedAt: string;
            }>;
        }>(`/api/funnels/${domainId}`);
    },

    async get(domainId: string, funnelId: string) {
        return apiRequest<{ funnel: any }>(`/api/funnels/${domainId}/${funnelId}`);
    },

    async create(domainId: string, data: { name: string; steps: Array<{ name: string; type: string; matchType?: string; matchValue: string }> }) {
        return apiRequest<{ funnel: any }>(`/api/funnels/${domainId}`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async delete(domainId: string, funnelId: string) {
        return apiRequest<{ message: string }>(`/api/funnels/${domainId}/${funnelId}`, {
            method: 'DELETE'
        });
    }
};

// Recordings API
// The list endpoint is /api/recordings/{domainId} and returns url/duration/
// eventsCount plus the session's device class - there is no visitorId, geo or
// page count on it. Filters: device by screen width (same breakpoints as the
// devices breakdown), duration short < 30s <= medium < 3min <= long.
export type RecordingDevice = 'desktop' | 'tablet' | 'mobile';
export type RecordingDuration = 'short' | 'medium' | 'long';

export const recordings = {
    async list(
        domainId: string,
        filters?: { device?: RecordingDevice; duration?: RecordingDuration; page?: number }
    ) {
        const params = new URLSearchParams();
        if (filters?.device) params.set('device', filters.device);
        if (filters?.duration) params.set('duration', filters.duration);
        if (filters?.page) params.set('page', String(filters.page));
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            recordings: Array<{
                id: string;
                url: string;
                duration: number;
                eventsCount: number;
                format: 'rrweb' | 'legacy';
                startedAt: string;
                endedAt: string | null;
                device: RecordingDevice | 'unknown';
            }>;
            /** Recordings started today (UTC), against settings.recordingDailyLimit. */
            startedToday: number;
            pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(`/api/recordings/${domainId}${query}`);
    },

    async get(domainId: string, recordingId: string) {
        return apiRequest<{
            id: string;
            url: string;
            duration: number;
            eventsCount: number;
            // rrweb events (numeric type) for `rrweb`; cursor-only events for `legacy`.
            format: 'rrweb' | 'legacy';
            events: Array<{ type: number | string; timestamp: number; [key: string]: unknown }>;
            startedAt: string;
            endedAt: string | null;
        }>(`/api/recordings/${domainId}/${recordingId}`);
    }
};

// Heatmaps API
// /api/heatmaps/{domainId} returns the points for ONE type (?type=click|scroll),
// and /api/heatmaps/{domainId}/pages lists the pages that have interactions.
export const heatmaps = {
    async pages(domainId: string) {
        return apiRequest<{
            pages: Array<{ path: string; clicks: number; visitors: number }>;
        }>(`/api/heatmaps/${domainId}/pages`);
    },

    async get(domainId: string, pageUrl: string, type: 'click' | 'scroll' = 'click') {
        const params = new URLSearchParams({ page: pageUrl, type });
        return apiRequest<{
            domainId: string;
            pageUrl: string;
            type: string;
            points: Array<{ x: number; y: number; count: number }>;
            totalInteractions: number;
            uniqueVisitors: number;
        }>(`/api/heatmaps/${domainId}?${params}`);
    }
};

// Insights API - scoped to a domain: /api/insights/{domainId}
export const insights = {
    async get(domainId: string) {
        return apiRequest<{
            insights: Array<{
                id: string;
                type: string;
                title: string;
                description: string;
                confidence: number;
                action: string;
                deepLink: string;
            }>;
            predictions: Array<{
                type: string;
                value: number;
                trend: 'up' | 'down' | 'stable';
                confidence: number;
            }>;
        }>(`/api/insights/${domainId}`);
    }
};

// Payments API (Paystack)
// GET /api/payments/plans: the admin-managed plans, active ones only.
// `bullets` are generated from the plan's real limits and features plus the
// admin's extra lines, so pricing cards can't contradict what customers get.
export interface Plan {
    id: string;
    name: string;
    price: number; // whole currency units, e.g. 45000 = ₦45,000
    currency?: string;
    interval?: 'monthly' | 'yearly';
    tagline?: string;
    badge?: string;
    show_on_landing?: boolean;
    bullets?: string[];
}

/** "/mo" or "/yr" after a price; nothing for a free plan. */
export function planPeriod(plan: Pick<Plan, 'price' | 'interval'>): string {
    if (plan.price <= 0) return '';
    return plan.interval === 'yearly' ? '/yr' : '/mo';
}

const CURRENCY_SYMBOLS: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };

/** 'Free' for a zero price, otherwise the amount with its currency symbol. */
export function formatPlanPrice(price: number, currency = 'NGN'): string {
    if (price <= 0) return 'Free';
    return `${CURRENCY_SYMBOLS[currency] ?? `${currency} `}${price.toLocaleString()}`;
}

export const payments = {
    /** Public. Active plans from the admin-managed plans table, with pricing bullets. */
    async getPlans() {
        return apiRequest<{ success: boolean; plans: Plan[] }>('/api/payments/plans');
    },

    /** Initialise a Paystack checkout session. On success, redirect to checkoutUrl. */
    async checkout(plan: string, promoCode?: string): Promise<{ checkoutUrl?: string; reference?: string; error?: string } | null> {
        const result = await apiRequest<{ success: boolean; checkoutUrl: string; reference: string; error?: string }>(
            '/api/payments/checkout',
            { method: 'POST', body: JSON.stringify({ plan, promoCode }) }
        );
        if (result.data?.success) {
            return { checkoutUrl: result.data.checkoutUrl, reference: result.data.reference };
        }
        // Return error details so the UI can display them
        return { error: result.data?.error || result.error || 'Unknown error' };
    },

    /** Validate a promo code and get discount preview. */
    async validatePromo(code: string, plan: string) {
        const result = await apiRequest<{
            valid: boolean; discount_type?: string; discount_value?: number;
            original_price?: number; discounted_price?: number; currency?: string; error?: string;
        }>('/api/payments/validate-promo', {
            method: 'POST', body: JSON.stringify({ code, plan })
        });
        return result.data || { valid: false, error: 'Failed to validate code' };
    },

    /** Verify a completed Paystack payment by reference. Returns the upgraded plan name. */
    async verify(reference: string): Promise<{ plan: string } | null> {
        const result = await apiRequest<{ success: boolean; plan: string }>(
            '/api/payments/verify',
            { method: 'POST', body: JSON.stringify({ reference }) }
        );
        if (result.data?.success) {
            return { plan: result.data.plan };
        }
        return null;
    },

    /** Every allowance on the account: used, limit, when it resets. Events are
     * counted over the plan's billing cycle (the calendar month without one). */
    async getUsage() {
        return apiRequest<{
            success: boolean;
            usage: {
                eventsThisMonth: number;
                eventsLimit: number;
                percentUsed: number;
                periodStart?: string;
                resetsAt?: string;
                projectedLimitAt?: string | null;
                meters: UsageMeter[];
            };
        }>('/api/payments/usage');
    },

    /** Fetch the current subscription from the server. */
    async getCurrent() {
        return apiRequest<{
            subscription: {
                plan: string;
                planName?: string;
                paidPlan?: string;
                paidPlanName?: string;
                status: string;
                state?: 'free' | 'active' | 'grace' | 'expired';
                graceEndsAt?: string | null;
                eventsUsed: number;
                eventsLimit: number;
                domainsLimit: number;
                currentPeriodEnd?: string;
                features: string[];
            };
        }>('/api/payments/current');
    },
};

// Custom Events API (Errors, Performance, Forms, Rage Clicks)
export const customEvents = {
    async getErrors(domainId: string, start?: string, end?: string) {
        return apiRequest<{
            totalErrors: number;
            errors: Array<{
                message: string;
                source: string | null;
                count: number;
                first_seen: string;
                last_seen: string;
            }>;
            trend: Array<{ day: string; count: number }>;
        }>(`/api/custom-events/${domainId}/errors${rangeQuery(start, end)}`);
    },

    async getPerformance(domainId: string, start?: string, end?: string) {
        return apiRequest<{
            metrics: {
                avg_lcp: number;
                avg_fid: number;
                avg_cls: number;
                avg_ttfb: number;
                avg_fcp: number;
                avg_load_time: number;
                sample_count: number;
            };
            trend: Array<{ day: string; avg_lcp: number; avg_fcp: number }>;
            byPage: Array<{ url: string; avg_lcp: number; avg_fcp: number; count: number }>;
        }>(`/api/custom-events/${domainId}/performance${rangeQuery(start, end)}`);
    },

    async getForms(domainId: string, start?: string, end?: string) {
        return apiRequest<{
            totalSubmissions: number;
            forms: Array<{
                form_id: string | null;
                form_name: string | null;
                action: string | null;
                method: string | null;
                submissions: number;
                avg_fields: number;
                pages: number;
            }>;
            trend: Array<{ day: string; count: number }>;
        }>(`/api/custom-events/${domainId}/forms${rangeQuery(start, end)}`);
    },

    async getRageClicks(domainId: string, start?: string, end?: string) {
        return apiRequest<{
            totalRageClicks: number;
            rageClicks: Array<{
                tag: string | null;
                element_id: string | null;
                text: string | null;
                url: string;
                count: number;
                avg_click_count: number;
            }>;
        }>(`/api/custom-events/${domainId}/rage-clicks${rangeQuery(start, end)}`);
    },
};


// Export API — GET /api/export/{domainId}?type=sessions|events returns a CSV file
// (up to 10,000 most recent rows). Pro plan and above.
export type ExportType = 'sessions' | 'events';

export const exportData = {
    /** Fetch the CSV and hand it to the browser as a download. */
    async downloadCsv(domainId: string, type: ExportType, retried = false): Promise<{ error?: string; upgrade?: boolean }> {
        const { accessToken } = getTokens();
        let response: Response;
        try {
            response = await fetch(`${API_URL}/api/export/${domainId}?type=${type}`, {
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
            });
        } catch {
            return { error: 'Network error' };
        }

        if (!response.ok) {
            if (response.status === 401 && !retried && (await refreshToken())) {
                return exportData.downloadCsv(domainId, type, true);
            }
            const body = await response.json().catch(() => ({}));
            return { error: body.error || 'Export failed', upgrade: !!body.upgrade };
        }

        const url = URL.createObjectURL(await response.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = `thravic-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        return {};
    },
};

// Webhooks API — /api/webhooks/{domainId}. The owner or a domain admin can manage
// them (Pro plan and above). Each subscribed event is POSTed as JSON, signed with
// HMAC-SHA256 of the body in X-Thravic-Signature when a secret is set. The secret
// is write-only: responses say only whether one is set.
export const WEBHOOK_EVENTS = ['pageview', 'click', 'scroll', 'form', 'custom', 'session_end'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface Webhook {
    id: string;
    url: string;
    events: WebhookEvent[];
    enabled: boolean;
    hasSecret: boolean;
    created_at: string;
}

/** The API answers a validation failure with an array of issues instead of a string. */
function webhookError(error: unknown): string {
    if (Array.isArray(error)) return error.map((issue: any) => issue?.message).filter(Boolean).join('; ') || 'Invalid webhook';
    return typeof error === 'string' ? error : 'Request failed';
}

export const webhooks = {
    async list(domainId: string) {
        return apiRequest<Webhook[]>(`/api/webhooks/${domainId}`);
    },

    async create(domainId: string, data: { url: string; events: WebhookEvent[]; secret?: string }) {
        const result = await apiRequest<Webhook>(`/api/webhooks/${domainId}`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return result.error !== undefined ? { error: webhookError(result.error) } : result;
    },

    async delete(domainId: string, webhookId: string) {
        return apiRequest<{ message: string }>(`/api/webhooks/${domainId}/${webhookId}`, {
            method: 'DELETE',
        });
    },
};
