const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiResponse<T> {
    data?: T;
    error?: string;
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
            return { error: data.error || 'Request failed' };
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
    async register(email: string, password: string, name: string) {
        const result = await apiRequest<{
            user: { id: string; email: string; name: string; subscription: string };
            accessToken: string;
            refreshToken: string;
        }>('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name })
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
        }>('/api/auth/me');
    },

    isAuthenticated() {
        return !!getTokens().accessToken;
    }
};

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
            }>;
        }>('/api/domains');
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
            settings: Record<string, boolean>;
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
    }
};

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

    // Get complete dashboard data - calls backend overview endpoint
    async getDashboard(domainId: string, start?: string, end?: string) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            period: { start: string; end: string };
            chart: {
                data: Array<{
                    date: string;
                    visitors: number;
                    sessions: number;
                    pageviews: number;
                }>;
            };
            metrics: {
                visitors: number;
                sessions: number;
                pageviews: number;
                bounceRate: number;
                avgDuration: number;
            };
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
export const funnels = {
    async list(domainId?: string) {
        const query = domainId ? `?domainId=${domainId}` : '';
        return apiRequest<{
            funnels: Array<{
                id: string;
                name: string;
                steps: Array<{ name: string; url: string }>;
                conversionRate: number;
            }>;
        }>(`/api/funnels${query}`);
    },

    async get(id: string) {
        return apiRequest<{
            funnel: {
                id: string;
                name: string;
                steps: Array<{ name: string; url: string; visitors: number; dropoff: number }>;
                conversionRate: number;
            };
        }>(`/api/funnels/${id}`);
    },

    async create(data: { name: string; domainId: string; steps: Array<{ name: string; url: string }> }) {
        return apiRequest<{ funnel: any }>('/api/funnels', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async delete(id: string) {
        return apiRequest<{ message: string }>(`/api/funnels/${id}`, {
            method: 'DELETE'
        });
    }
};

// Recordings API  
export const recordings = {
    async list(domainId?: string, filters?: { device?: string; duration?: string }) {
        const params = new URLSearchParams();
        if (domainId) params.set('domainId', domainId);
        if (filters?.device) params.set('device', filters.device);
        if (filters?.duration) params.set('duration', filters.duration);
        const query = params.toString() ? `?${params}` : '';

        return apiRequest<{
            recordings: Array<{
                id: string;
                visitorId: string;
                device: string;
                country: string;
                duration: number;
                pages: number;
                startedAt: string;
                funnelCompleted: boolean;
            }>;
        }>(`/api/recordings${query}`);
    },

    async get(id: string) {
        return apiRequest<{
            recording: {
                id: string;
                visitorId: string;
                events: Array<{ type: string; timestamp: string; data: any }>;
                duration: number;
            };
        }>(`/api/recordings/${id}`);
    }
};

// Heatmaps API
export const heatmaps = {
    async list(domainId?: string) {
        const query = domainId ? `?domainId=${domainId}` : '';
        return apiRequest<{
            heatmaps: Array<{
                id: string;
                page: string;
                clicks: number;
                maxScroll: number;
            }>;
        }>(`/api/heatmaps${query}`);
    },

    async get(pageUrl: string, domainId: string) {
        const params = new URLSearchParams({ page: pageUrl, domainId });
        return apiRequest<{
            clicks: Array<{ x: number; y: number; count: number }>;
            scrollDepth: Array<{ depth: number; percentage: number }>;
        }>(`/api/heatmaps/data?${params}`);
    }
};

// Insights API
export const insights = {
    async get(domainId?: string) {
        const query = domainId ? `?domainId=${domainId}` : '';
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
        }>(`/api/insights${query}`);
    }
};

// Payments API (Paystack)
export const payments = {
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

    /** Fetch the current subscription from the server. */
    async getCurrent() {
        return apiRequest<{
            subscription: {
                plan: string;
                status: string;
                eventsUsed: number;
                eventsLimit: number;
                domainsLimit: number;
                currentPeriodEnd?: string;
                features: string[];
            };
        }>('/api/payments/current');
    },
};

