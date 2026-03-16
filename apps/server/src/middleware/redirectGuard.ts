// ──────────────────────────────────────────────
// Thravic — Redirect Guard Middleware
// Prevents open-redirect vulnerabilities by validating every
// redirect URL against an explicit allowlist.
// ──────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';

/**
 * Build the set of allowed redirect hosts from CORS_ORIGIN + the API's own host.
 * Called once at startup.
 */
function buildAllowedHosts(): Set<string> {
    const hosts = new Set<string>();

    // Always allow redirects to the API's own origin
    hosts.add(''); // relative paths (no host)

    // Explicitly allow OAuth provider endpoints
    hosts.add('github.com');
    hosts.add('accounts.google.com');

    const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3002')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    for (const origin of corsOrigins) {
        try {
            const url = new URL(origin);
            hosts.add(url.host);
        } catch {
            console.warn(`⚠️  redirectGuard: cannot parse CORS_ORIGIN "${origin}"`);
        }
    }

    return hosts;
}

const allowedHosts = buildAllowedHosts();

/**
 * Validate whether a URL is safe to redirect to.
 * Returns `true` only if:
 *   1. It's a relative path (starts with `/` and NOT `//`)
 *   2. Its host is in the allowlist derived from CORS_ORIGIN
 */
export function isSafeRedirectUrl(url: string): boolean {
    // Block protocol-relative URLs like //evil.com
    if (url.startsWith('//')) return false;

    // Allow safe relative paths
    if (url.startsWith('/')) return true;

    try {
        const parsed = new URL(url);

        // Only allow http(s) protocols — block javascript:, data:, etc.
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;

        return allowedHosts.has(parsed.host);
    } catch {
        // Malformed URL — block it
        return false;
    }
}

/**
 * Safe redirect helper. Use this instead of `res.redirect()` directly.
 * Validates the target URL and returns 400 if it's not allowed.
 *
 * Usage:
 *   import { safeRedirect } from '../middleware/redirectGuard';
 *   safeRedirect(res, req.query.returnUrl as string, '/dashboard');
 */
export function safeRedirect(
    res: Response,
    url: string | undefined | null,
    fallback: string = '/'
): void {
    const target = url || fallback;

    if (!isSafeRedirectUrl(target)) {
        console.warn(`🚫 Blocked unsafe redirect to: ${target}`);
        res.status(400).json({
            error: 'Invalid redirect URL',
            code: 'UNSAFE_REDIRECT',
        });
        return;
    }

    res.redirect(target);
}

/**
 * Global middleware that intercepts any response with a Location header
 * and validates it against the allowlist. This catches accidental redirects
 * from any route, even ones that don't use safeRedirect().
 */
export function redirectGuard() {
    return (_req: Request, res: Response, next: NextFunction) => {
        // Monkey-patch res.redirect to enforce validation
        const originalRedirect = res.redirect.bind(res);

        // Override redirect — Express signature: redirect([status,] url)
        (res as any).redirect = function (statusOrUrl: number | string, url?: string) {
            const target = typeof statusOrUrl === 'string' ? statusOrUrl : url!;
            const status = typeof statusOrUrl === 'number' ? statusOrUrl : 302;

            if (!isSafeRedirectUrl(target)) {
                console.warn(`🚫 redirectGuard blocked unsafe redirect to: ${target}`);
                res.status(400).json({
                    error: 'Invalid redirect URL',
                    code: 'UNSAFE_REDIRECT',
                });
                return;
            }

            originalRedirect(status, target);
        };

        next();
    };
}
