// Forwards the panel's calls to the API's /api/admin routes, adding the admin
// token from the httpOnly cookie. When the short-lived access token has run out
// it is renewed once with the refresh cookie; if that fails the session is over.

import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_COOKIE, REFRESH_COOKIE, apiBase, clearSessionCookies, forwardHeaders,
    passesCsrfCheck, refreshTokens, setSessionCookies, type AdminTokens,
} from '@/lib/server/session';

export const dynamic = 'force-dynamic';

// Response headers worth passing back (a CSV export needs the last one).
const PASS_HEADERS = ['content-type', 'retry-after', 'content-disposition'];

async function forward(request: NextRequest, path: string[]) {
    // Only the admin API, and never its sign-in routes (those have their own handlers).
    // Segments arrive decoded, so a "%2F.." inside one could climb out of /api/admin.
    const unsafe = path.some(part => part === '..' || part === '.' || part.includes('/') || part.includes('\\'));
    const target = path.map(encodeURIComponent).join('/');
    if (unsafe || !target.startsWith('api/admin/') || target.startsWith('api/admin/auth/')) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!passesCsrfCheck(request)) {
        return NextResponse.json({ error: 'Request blocked' }, { status: 403 });
    }

    const url = `${apiBase()}/${target}${request.nextUrl.search}`;
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();

    const send = (accessToken: string | undefined) => fetch(url, {
        method: request.method,
        headers: {
            ...forwardHeaders(request),
            ...(request.headers.get('content-type') ? { 'Content-Type': request.headers.get('content-type') as string } : {}),
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body,
        cache: 'no-store',
    });

    let renewed: AdminTokens | null = null;
    let upstream = await send(request.cookies.get(ACCESS_COOKIE)?.value);

    if (upstream.status === 401) {
        const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
        renewed = refreshToken ? await refreshTokens(request, refreshToken) : null;
        if (!renewed) {
            const ended = NextResponse.json({ error: 'Your admin session has ended. Sign in again.' }, { status: 401 });
            clearSessionCookies(ended);
            return ended;
        }
        upstream = await send(renewed.accessToken);
    }

    const headers = new Headers();
    for (const name of PASS_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
    }
    headers.set('Cache-Control', 'no-store');
    const response = new NextResponse(upstream.body, { status: upstream.status, headers });
    if (renewed) setSessionCookies(response, request, renewed);
    return response;
}

type Context = { params: { path: string[] } };

export const GET = (request: NextRequest, { params }: Context) => forward(request, params.path);
export const POST = (request: NextRequest, { params }: Context) => forward(request, params.path);
export const PUT = (request: NextRequest, { params }: Context) => forward(request, params.path);
export const PATCH = (request: NextRequest, { params }: Context) => forward(request, params.path);
export const DELETE = (request: NextRequest, { params }: Context) => forward(request, params.path);
