// Admin API Helper — Centralized fetch with auth token management

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Token management
let accessToken: string | null = null;
let refreshToken: string | null = null;

if (typeof window !== 'undefined') {
    accessToken = localStorage.getItem('admin_token');
    refreshToken = localStorage.getItem('admin_refresh_token');
}

export function setTokens(access: string, refresh: string) {
    accessToken = access;
    refreshToken = refresh;
    localStorage.setItem('admin_token', access);
    localStorage.setItem('admin_refresh_token', refresh);
}

export function clearTokens() {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh_token');
}

export function getAccessToken() {
    return accessToken;
}

// Main API fetch
export async function adminFetch<T = any>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE}${endpoint}`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    // Handle 401 — try refresh
    if (response.status === 401 && refreshToken) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
            headers['Authorization'] = `Bearer ${accessToken}`;
            const retryResponse = await fetch(url, { ...options, headers });
            if (!retryResponse.ok) {
                const error = await retryResponse.json().catch(() => ({ error: 'Request failed' }));
                throw new Error(error.error || 'Request failed');
            }
            return retryResponse.json();
        } else {
            clearTokens();
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
            throw new Error('Session expired');
        }
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

async function tryRefreshToken(): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) return false;

        const data = await res.json();
        setTokens(data.accessToken, data.refreshToken);
        return true;
    } catch {
        return false;
    }
}

// Convenience methods
export const api = {
    get: <T = any>(endpoint: string) => adminFetch<T>(endpoint),
    post: <T = any>(endpoint: string, body?: any) =>
        adminFetch<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    put: <T = any>(endpoint: string, body?: any) =>
        adminFetch<T>(endpoint, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
    patch: <T = any>(endpoint: string, body?: any) =>
        adminFetch<T>(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
    delete: <T = any>(endpoint: string, body?: any) =>
        adminFetch<T>(endpoint, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
};
