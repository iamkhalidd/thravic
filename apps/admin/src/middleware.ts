// Runs before every request to the admin panel.
//
// 1. IP allowlist: when ADMIN_ALLOWED_IPS is set (comma-separated addresses or
//    IPv4 ranges like 102.89.0.0/16), anyone else gets a plain 403 before any
//    page or API call. Unset means open, as before.
// 2. Pages other than /login need a session cookie, so a signed-out visitor goes
//    straight to the sign-in page instead of loading an empty dashboard.

import { NextRequest, NextResponse } from 'next/server';

const REFRESH_COOKIE = 'thravic_admin_rt';

function ipv4ToNumber(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    let value = 0;
    for (const part of parts) {
        const n = Number(part);
        if (!/^\d{1,3}$/.test(part) || n > 255) return null;
        value = value * 256 + n;
    }
    return value;
}

export function ipAllowed(ip: string, rules: string[]): boolean {
    const address = ip.replace(/^::ffff:/, '');
    return rules.some(rule => {
        if (!rule.includes('/')) return rule === address;
        const [base, bitsText] = rule.split('/');
        const bits = Number(bitsText);
        const a = ipv4ToNumber(address);
        const b = ipv4ToNumber(base);
        if (a === null || b === null || !(bits >= 0 && bits <= 32)) return false;
        const size = 2 ** (32 - bits);
        return Math.floor(a / size) === Math.floor(b / size);
    });
}

export function middleware(request: NextRequest) {
    const rules = (process.env.ADMIN_ALLOWED_IPS || '').split(',').map(r => r.trim()).filter(Boolean);
    if (rules.length > 0) {
        const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.ip || '';
        if (!ip || !ipAllowed(ip, rules)) {
            return new NextResponse('This admin panel is not available from your network.', { status: 403 });
        }
    }

    const { pathname } = request.nextUrl;
    const isPage = !pathname.startsWith('/api/');
    if (isPage && pathname !== '/login' && !request.cookies.get(REFRESH_COOKIE)) {
        return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
}

export const config = {
    // Everything except Next's own files and the static images in /public.
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg|webp)$).*)'],
};
