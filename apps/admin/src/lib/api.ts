// Admin API helper. Calls go to this panel's own server (/api/proxy), which adds
// the admin token from an httpOnly cookie; the page never sees a token.

const PROXY = '/api/proxy';

// How long a 429 asks us to wait, if it is short enough to wait out. The API
// counts signed-in requests per minute, so a brief burst clears in seconds.
const MAX_RATE_LIMIT_WAIT_S = 10;

function rateLimitWaitMs(response: Response): number | null {
    const seconds = Number(response.headers.get('Retry-After'));
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_RATE_LIMIT_WAIT_S) return null;
    return seconds * 1000;
}

function goToLogin(reason?: string) {
    if (typeof window === 'undefined' || window.location.pathname === '/login') return;
    window.location.href = reason ? `/login?reason=${reason}` : '/login';
}

// Every call that changes something carries this header; see lib/server/session.ts.
export const CSRF_HEADERS = { 'x-thravic-admin': '1' };

// Raw response, for downloads. Throws with the API's message on failure.
export async function adminFetchRaw(
    endpoint: string,
    options: RequestInit = {},
    rateLimitRetried = false
): Promise<Response> {
    const response = await fetch(`${PROXY}${endpoint}`, {
        ...options,
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            ...CSRF_HEADERS,
            ...(options.headers as Record<string, string>),
        },
    });

    // Rate limited: wait it out once rather than leaving the page empty
    const waitMs = response.status === 429 && !rateLimitRetried ? rateLimitWaitMs(response) : null;
    if (waitMs !== null) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return adminFetchRaw(endpoint, options, true);
    }

    if (response.status === 401) {
        goToLogin('expired');
        throw new Error('Your admin session has ended. Sign in again.');
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response;
}

export async function adminFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await adminFetchRaw(endpoint, options);
    return response.json();
}

export async function signOut(reason?: string) {
    await fetch('/api/session/logout', { method: 'POST', headers: CSRF_HEADERS, credentials: 'same-origin' }).catch(() => undefined);
    window.location.href = reason ? `/login?reason=${reason}` : '/login';
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
