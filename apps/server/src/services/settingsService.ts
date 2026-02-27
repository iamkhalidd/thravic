// System Settings Service
// Runtime-configurable settings stored in database with in-memory cache

import { query, queryOne } from '../db';

// In-memory cache with TTL
const cache = new Map<string, { value: any; expiry: number }>();
const CACHE_TTL = 60_000; // 60 seconds

// Get a setting value (cached)
export async function getSetting<T = any>(key: string): Promise<T | null> {
    // Check cache first
    const cached = cache.get(key);
    if (cached && cached.expiry > Date.now()) {
        return cached.value as T;
    }

    try {
        const row = await queryOne<{ value: any }>(
            'SELECT value FROM system_settings WHERE key = $1',
            [key]
        );

        if (row) {
            cache.set(key, { value: row.value, expiry: Date.now() + CACHE_TTL });
            return row.value as T;
        }
        return null;
    } catch {
        return null;
    }
}

// Set a setting value
export async function setSetting(key: string, value: any, updatedBy?: string): Promise<void> {
    await query(
        `INSERT INTO system_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, JSON.stringify(value), updatedBy || null]
    );

    // Invalidate cache
    cache.set(key, { value, expiry: Date.now() + CACHE_TTL });
}

// Get all settings
export async function getAllSettings(): Promise<Record<string, any>> {
    const rows = await query<{ key: string; value: any; updated_at: string }>(
        'SELECT key, value, updated_at FROM system_settings ORDER BY key'
    );

    const settings: Record<string, any> = {};
    for (const row of rows) {
        settings[row.key] = row.value;
        cache.set(row.key, { value: row.value, expiry: Date.now() + CACHE_TTL });
    }
    return settings;
}

// Check boolean setting (convenience)
export async function isEnabled(key: string): Promise<boolean> {
    const value = await getSetting(key);
    return value === true || value === 'true';
}

// Clear cache (useful for testing)
export function clearCache(): void {
    cache.clear();
}
