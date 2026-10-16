// Step 1 of the admin sign-in: email and password. Answers with a short-lived
// ticket and whether the next step is a code or setting up the app.

import { NextRequest, NextResponse } from 'next/server';
import { apiBase, forwardHeaders, passesCsrfCheck } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    if (!passesCsrfCheck(request)) return NextResponse.json({ error: 'Request blocked' }, { status: 403 });
    try {
        const res = await fetch(`${apiBase()}/api/admin/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...forwardHeaders(request) },
            body: await request.text(),
            cache: 'no-store',
        });
        return NextResponse.json(await res.json().catch(() => ({ error: 'Sign-in failed' })), { status: res.status });
    } catch {
        return NextResponse.json({ error: 'The API cannot be reached. Try again in a minute.' }, { status: 502 });
    }
}
