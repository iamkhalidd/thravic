// Server-only helpers for the admin session.
//
// The browser never holds the admin tokens. They live in httpOnly cookies on the
// admin panel's own domain, and the panel's server (src/app/api/...) attaches
// them when it forwards a request to the API. A script running on the page
// cannot read them, which is the point.

import { NextRequest, NextResponse } from 'next/server';

export const ACCESS_COOKIE = 'thravic_admin_at';
export const REFRESH_COOKIE = 'thravic_admin_rt';

// The API's address as the panel's server sees it. API_URL is server-only;
// NEXT_PUBLIC_API_URL is the older setting and still works.
export function apiBase(): string {
    return (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
}

// Headers every call to the API carries: who the visitor really is (for the
// API's rate limits and audit log) and, when set, the shared proxy secret.
export function forwardHeaders(request: NextRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    const ip = clientIp(request);
    if (ip) headers['X-Forwarded-For'] = ip;
    const agent = request.headers.get('user-agent');
    if (agent) headers['User-Agent'] = agent;
    const secret = process.env.ADMIN_PROXY_SECRET;
    if (secret) headers['X-Admin-Proxy-Secret'] = secret;
    return headers;
}

export function clientIp(request: NextRequest): string {
    // Vercel sets x-forwarded-for itself, so its first entry is the visitor.
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return request.headers.get('x-real-ip') || '';
}

export interface AdminTokens {
    accessToken: string;
    refreshToken: string;
    accessExpiresIn: number;
    refreshExpiresAt: number;
}

export function setSessionCookies(response: NextResponse, request: NextRequest, tokens: AdminTokens) {
    const secure = request.nextUrl.protocol === 'https:';
    const base = { httpOnly: true, secure, sameSite: 'strict' as const, path: '/' };
    response.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: tokens.accessExpiresIn });
    response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
        ...base,
        maxAge: Math.max(0, tokens.refreshExpiresAt - Math.floor(Date.now() / 1000)),
    });
}

export function clearSessionCookies(response: NextResponse) {
    response.cookies.set(ACCESS_COOKIE, '', { path: '/', maxAge: 0 });
    response.cookies.set(REFRESH_COOKIE, '', { path: '/', maxAge: 0 });
}

// Requests that change something must carry this header. A form or link on
// another site cannot add it, so it blocks cross-site request forgery on top of
// the SameSite=Strict cookies.
export const CSRF_HEADER = 'x-thravic-admin';

export function passesCsrfCheck(request: NextRequest): boolean {
    if (request.method === 'GET' || request.method === 'HEAD') return true;
    return request.headers.get(CSRF_HEADER) === '1';
}

export async function refreshTokens(request: NextRequest, refreshToken: string): Promise<AdminTokens | null> {
    try {
        const res = await fetch(`${apiBase()}/api/admin/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...forwardHeaders(request) },
            body: JSON.stringify({ refreshToken }),
            cache: 'no-store',
        });
        if (!res.ok) return null;
        return (await res.json()) as AdminTokens;
    } catch {
        return null;
    }
}
