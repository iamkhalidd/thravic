// ──────────────────────────────────────────────
// Thravic — Security Configuration
// Centralizes security-related config and startup validation.
// ──────────────────────────────────────────────

import { createLogger } from './logger';

const log = createLogger('Security');

const INSECURE_DEFAULTS = ['default-secret', 'default-refresh-secret', 'your-secret-key', 'change-me'];

/**
 * Get the JWT access token secret.
 * Fails fast in production if a default/weak secret is detected.
 */
export function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET || 'default-secret';
    return secret;
}

/**
 * Get the JWT refresh token secret.
 */
export function getJwtRefreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET || 'default-refresh-secret';
    return secret;
}

/**
 * Validate that all security-critical environment variables are properly set.
 * Logs warnings in development, throws in production.
 */
export function validateSecurityConfig(): void {
    const isProd = process.env.NODE_ENV === 'production';
    const issues: string[] = [];

    // JWT Secrets
    const jwtSecret = process.env.JWT_SECRET;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

    if (!jwtSecret || INSECURE_DEFAULTS.includes(jwtSecret)) {
        issues.push('JWT_SECRET is not set or uses an insecure default');
    }
    if (!jwtRefreshSecret || INSECURE_DEFAULTS.includes(jwtRefreshSecret)) {
        issues.push('JWT_REFRESH_SECRET is not set or uses an insecure default');
    }

    // Database
    if (!process.env.DATABASE_URL) {
        issues.push('DATABASE_URL is not set');
    }

    // CORS
    if (isProd && !process.env.CORS_ORIGIN) {
        issues.push('CORS_ORIGIN should be explicitly set in production');
    }

    if (issues.length > 0) {
        const msg = `\n🔒 Security Configuration Issues:\n${issues.map((i) => `   ⚠️  ${i}`).join('\n')}\n`;

        if (isProd) {
            log.error(msg);
            throw new Error('Refusing to start: security configuration is insecure for production.');
        } else {
            log.warn(msg);
        }
    }
}
