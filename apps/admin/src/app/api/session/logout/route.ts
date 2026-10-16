// Ends the admin session on the API and clears the cookies.

import { NextRequest, NextResponse } from 'next/server';
import { REFRESH_COOKIE, apiBase, clearSessionCookies, forwardHeaders, passesCsrfCheck } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    if (!passesCsrfCheck(request)) return NextResponse.json({ error: 'Request blocked' }, { status: 403 });
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (refreshToken) {
        await fetch(`${apiBase()}/api/admin/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...forwardHeaders(request) },
            body: JSON.stringify({ refreshToken }),
            cache: 'no-store',
        }).catch(() => undefined);
    }
    const response = NextResponse.json({ ok: true });
    clearSessionCookies(response);
    return response;
}
