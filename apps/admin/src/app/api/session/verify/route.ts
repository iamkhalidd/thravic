// Step 2 of the admin sign-in: the authenticator code. On success the tokens go
// into httpOnly cookies and only the admin's id, email and role reach the page.

import { NextRequest, NextResponse } from 'next/server';
import { apiBase, forwardHeaders, passesCsrfCheck, setSessionCookies } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    if (!passesCsrfCheck(request)) return NextResponse.json({ error: 'Request blocked' }, { status: 403 });
    try {
        const res = await fetch(`${apiBase()}/api/admin/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...forwardHeaders(request) },
            body: await request.text(),
            cache: 'no-store',
        });
        const data = await res.json().catch(() => ({ error: 'Sign-in failed' }));
        if (!res.ok) return NextResponse.json(data, { status: res.status });

        const response = NextResponse.json({ user: data.user });
        setSessionCookies(response, request, data);
        return response;
    } catch {
        return NextResponse.json({ error: 'The API cannot be reached. Try again in a minute.' }, { status: 502 });
    }
}
