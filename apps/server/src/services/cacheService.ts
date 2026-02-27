// ──────────────────────────────────────────────
// TrackFlow — Redis Cache Service
// ──────────────────────────────────────────────
import { createClient, RedisClientType } from 'redis';
import { createLogger } from '../config/logger';

const log = createLogger('Redis');

let client: RedisClientType | null = null;
let isConnected = false;

/**
 * Initialize the Redis connection.
 * If REDIS_URL is not set or connection fails, caching gracefully degrades to no-op.
 */
export async function initRedis(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
        log.warn('REDIS_URL not set — caching disabled');
        return;
    }

    try {
        client = createClient({ url }) as RedisClientType;
        client.on('error', (err) => {
            if (isConnected) {
                log.error('Connection error', err);
            }
            isConnected = false;
        });
        client.on('connect', () => {
            isConnected = true;
        });

        // Connect with a 5-second timeout so the server doesn't hang
        await Promise.race([
            client.connect(),
            new Promise<void>((_, reject) =>
                setTimeout(() => reject(new Error('Connection timeout (5s)')), 5000)
            )
        ]);
        log.info('Redis connected');
    } catch (err) {
        log.warn('Redis connection failed — caching disabled', { error: (err as Error).message });
        try { await client?.disconnect(); } catch { }
        client = null;
    }
}

/**
 * Close the Redis connection gracefully.
 */
export async function closeRedis(): Promise<void> {
    if (client && isConnected) {
        await client.quit();
        isConnected = false;
    }
}

// ── Cache Operations ────────────────────────

/**
 * Get a cached value. Returns null on cache miss or if Redis is unavailable.
 */
export async function get<T>(key: string): Promise<T | null> {
    if (!client || !isConnected) return null;
    try {
        const raw = await client.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

/**
 * Set a cached value with TTL in seconds.
 */
export async function set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!client || !isConnected) return;
    try {
        await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch {
        // Silently fail — cache is non-critical
    }
}

/**
 * Delete a cached value.
 */
export async function del(key: string): Promise<void> {
    if (!client || !isConnected) return;
    try {
        await client.del(key);
    } catch {
        // Silently fail
    }
}

/**
 * Delete all keys matching a pattern (e.g., `domain:abc123:*`).
 */
export async function invalidatePattern(pattern: string): Promise<void> {
    if (!client || !isConnected) return;
    try {
        const keys = await client.keys(pattern);
        if (keys.length > 0) {
            await client.del(keys);
        }
    } catch {
        // Silently fail
    }
}

// ── Pre-built Cache Keys ────────────────────

export const CacheKeys = {
    /** Analytics dashboard overview — TTL 60s */
    analyticsOverview: (domainId: string) => `analytics:overview:${domainId}`,

    /** Realtime visitor count — TTL 10s */
    realtime: (domainId: string) => `realtime:${domainId}`,

    /** Source breakdown — TTL 300s */
    sources: (domainId: string) => `sources:${domainId}`,

    /** Top pages — TTL 120s */
    topPages: (domainId: string) => `analytics:pages:${domainId}`,

    /** Domain config (rarely changes) — TTL 600s */
    domain: (domainId: string) => `domain:${domainId}`,

    /** Domain by tracking ID — TTL 600s */
    domainByTrackingId: (trackingId: string) => `domain:tid:${trackingId}`,
};

export const CacheTTL = {
    REALTIME: 10,
    ANALYTICS_OVERVIEW: 60,
    TOP_PAGES: 120,
    SOURCES: 300,
    DOMAIN: 600,
};

// ── Cache-through helper ────────────────────

/**
 * Try to load from cache. On miss, call `fetcher()`, cache the result, and return it.
 */
export async function cacheThrough<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>
): Promise<T> {
    const cached = await get<T>(key);
    if (cached !== null) return cached;

    const fresh = await fetcher();
    await set(key, fresh, ttlSeconds);
    return fresh;
}
