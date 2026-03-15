// ──────────────────────────────────────────────
// Thravic — Domain Service
// ──────────────────────────────────────────────
import { query, queryOne } from '../db';
import redisClient from '../db/redis';

export interface DomainRow {
    id: string;
    user_id: string;
    domain: string;
    name: string;
    tracking_id: string;
    verified: boolean;
    created_at: Date;
    owner_plan?: string;
}

export async function create(
    userId: string,
    domain: string,
    name: string,
    trackingId: string
): Promise<DomainRow> {
    const rows = await query<DomainRow>(
        `INSERT INTO domains (user_id, domain, name, tracking_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, domain, name, trackingId]
    );
    return rows[0];
}

export async function listByUser(userId: string): Promise<DomainRow[]> {
    return query<DomainRow>(
        `WITH user_domains AS (
             SELECT * FROM domains WHERE user_id = $1
             UNION
             SELECT d.* FROM domains d
             JOIN domain_members dm ON d.id = dm.domain_id
             WHERE dm.user_id = $1
         )
         SELECT ud.*, 
            COALESCE(
                (SELECT plan FROM subscriptions s WHERE s.user_id = ud.user_id AND status = 'active' ORDER BY created_at DESC LIMIT 1),
                'free'
            ) as owner_plan
         FROM user_domains ud
         ORDER BY ud.created_at DESC`,
        [userId]
    );
}

export async function getById(id: string): Promise<DomainRow | null> {
    return queryOne<DomainRow>(
        `SELECT * FROM domains WHERE id = $1`,
        [id]
    );
}

export async function hasAccess(domainId: string, userId: string): Promise<boolean> {
    const row = await queryOne(
        `SELECT 1 FROM domains WHERE id = $1 AND user_id = $2
         UNION
         SELECT 1 FROM domain_members WHERE domain_id = $1 AND user_id = $2`,
        [domainId, userId]
    );
    return !!row;
}

export async function getByTrackingId(trackingId: string): Promise<DomainRow | null> {
    const cacheKey = `domain:tracking:${trackingId}`;
    try {
        const cached = await redisClient.get(cacheKey);
        if (cached) return JSON.parse(cached) as DomainRow;
    } catch (e) {
        /* ignore cache read error */
    }

    const domain = await queryOne<DomainRow>(
        `SELECT * FROM domains WHERE tracking_id = $1`,
        [trackingId]
    );

    if (domain) {
        try {
            await redisClient.setex(cacheKey, 300, JSON.stringify(domain)); // 5 min TTL
        } catch (e) {
            /* ignore cache write error */
        }
    }

    return domain;
}

export async function verify(id: string): Promise<DomainRow | null> {
    return queryOne<DomainRow>(
        `UPDATE domains SET verified = true WHERE id = $1 RETURNING *`,
        [id]
    );
}

export async function remove(id: string): Promise<void> {
    await query(`DELETE FROM domains WHERE id = $1`, [id]);
}

export async function countByUser(userId: string): Promise<number> {
    const row = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM domains WHERE user_id = $1`,
        [userId]
    );
    return parseInt(row?.count || '0', 10);
}
