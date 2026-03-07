// ──────────────────────────────────────────────
// Thravic — Refresh Token Store
// Redis-backed (falls back to in-memory for dev without Redis)
// ──────────────────────────────────────────────
import * as cache from '../services/cacheService';

// Fallback for when Redis is not available
const memoryStore = new Set<string>();

const REFRESH_TOKEN_PREFIX = 'rt:';
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 7; // 7 days

/**
 * Store a refresh token.
 */
export async function storeRefreshToken(token: string): Promise<void> {
    const stored = await cache.set(`${REFRESH_TOKEN_PREFIX}${token}`, '1', REFRESH_TOKEN_TTL);
    // If Redis unavailable, cache.set silently fails — fallback to memory
    memoryStore.add(token);
}

/**
 * Check if a refresh token is valid (exists in store).
 */
export async function hasRefreshToken(token: string): Promise<boolean> {
    const cached = await cache.get<string>(`${REFRESH_TOKEN_PREFIX}${token}`);
    if (cached !== null) return true;
    // Fallback to in-memory
    return memoryStore.has(token);
}

/**
 * Remove a refresh token (on rotation or logout).
 */
export async function removeRefreshToken(token: string): Promise<void> {
    await cache.del(`${REFRESH_TOKEN_PREFIX}${token}`);
    memoryStore.delete(token);
}

/**
 * Remove ALL refresh tokens for a user (force logout everywhere).
 * Only works with Redis — memory store doesn't track user→token mapping.
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
    await cache.invalidatePattern(`${REFRESH_TOKEN_PREFIX}*:${userId}`);
}
