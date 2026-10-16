// Passes a crash report from the panel's error page to the API, which logs it
// and sends it to Sentry. Same origin, so the browser needs no API address.

import { NextRequest, NextResponse } from 'next/server';
import { apiBase, forwardHeaders } from '@/lib/server/session';

const MAX_BYTES = 8 * 1024;

export async function POST(request: NextRequest) {
    const body = await request.text();
    if (body.length > MAX_BYTES) return new NextResponse(null, { status: 413 });
    try {
        const res = await fetch(`${apiBase()}/api/client-errors`, {
            method: 'POST',
            headers: { ...forwardHeaders(request), 'Content-Type': 'application/json' },
            body,
            cache: 'no-store',
        });
        return new NextResponse(null, { status: res.status === 204 ? 204 : res.status });
    } catch {
        return new NextResponse(null, { status: 502 });
    }
}
