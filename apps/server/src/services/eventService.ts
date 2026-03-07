// ──────────────────────────────────────────────
// Thravic — Event Service
// ──────────────────────────────────────────────
import { query, queryOne, transaction } from '../db';

export interface EventRow {
    id: string;
    domain_id: string;
    session_id: string | null;
    visitor_id: string | null;
    type: string;
    url: string;
    referrer: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    data: Record<string, unknown> | null;
    created_at: Date;
}

export interface InsertEventParams {
    domainId: string;
    sessionId?: string;
    visitorId?: string;
    type: string;
    url: string;
    referrer?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    data?: Record<string, unknown>;
}

/**
 * Insert a single event.
 */
export async function insertEvent(params: InsertEventParams): Promise<EventRow> {
    const rows = await query<EventRow>(
        `INSERT INTO events (domain_id, session_id, visitor_id, type, url, referrer,
                             utm_source, utm_medium, utm_campaign, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
            params.domainId,
            params.sessionId || null,
            params.visitorId || null,
            params.type,
            params.url,
            params.referrer || null,
            params.utmSource || null,
            params.utmMedium || null,
            params.utmCampaign || null,
            params.data ? JSON.stringify(params.data) : null,
        ]
    );
    return rows[0];
}

/**
 * Batch-insert multiple events within a transaction.
 */
export async function batchInsert(eventList: InsertEventParams[]): Promise<number> {
    if (eventList.length === 0) return 0;

    return transaction(async (client) => {
        let count = 0;
        for (const e of eventList) {
            await client.query(
                `INSERT INTO events (domain_id, session_id, visitor_id, type, url, referrer,
                                     utm_source, utm_medium, utm_campaign, data)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    e.domainId,
                    e.sessionId || null,
                    e.visitorId || null,
                    e.type,
                    e.url,
                    e.referrer || null,
                    e.utmSource || null,
                    e.utmMedium || null,
                    e.utmCampaign || null,
                    e.data ? JSON.stringify(e.data) : null,
                ]
            );
            count++;
        }
        return count;
    });
}

/**
 * Query events for a domain within a date range.
 */
export async function queryByDomain(
    domainId: string,
    startDate: Date,
    endDate: Date,
    type?: string
): Promise<EventRow[]> {
    if (type) {
        return query<EventRow>(
            `SELECT * FROM events
             WHERE domain_id = $1
               AND created_at >= $2
               AND created_at <= $3
               AND type = $4
             ORDER BY created_at DESC`,
            [domainId, startDate, endDate, type]
        );
    }
    return query<EventRow>(
        `SELECT * FROM events
         WHERE domain_id = $1
           AND created_at >= $2
           AND created_at <= $3
         ORDER BY created_at DESC`,
        [domainId, startDate, endDate]
    );
}

/**
 * Count total events for a domain within a date range.
 */
export async function countByDomain(
    domainId: string,
    startDate: Date,
    endDate: Date,
    type?: string
): Promise<number> {
    const params: any[] = [domainId, startDate, endDate];
    let sql = `SELECT COUNT(*)::text as count FROM events
               WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3`;
    if (type) {
        sql += ` AND type = $4`;
        params.push(type);
    }
    const row = await queryOne<{ count: string }>(sql, params);
    return parseInt(row?.count || '0', 10);
}

/**
 * Get unique visitor count for a domain within a date range.
 */
export async function countUniqueVisitors(
    domainId: string,
    startDate: Date,
    endDate: Date
): Promise<number> {
    const row = await queryOne<{ count: string }>(
        `SELECT COUNT(DISTINCT visitor_id)::text as count FROM events
         WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3`,
        [domainId, startDate, endDate]
    );
    return parseInt(row?.count || '0', 10);
}

/**
 * Get top pages (by pageview count) for a domain within a date range.
 */
export async function getTopPages(
    domainId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
): Promise<{ url: string; views: number }[]> {
    return query<{ url: string; views: number }>(
        `SELECT url, COUNT(*)::int as views FROM events
         WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3
           AND type = 'pageview'
         GROUP BY url
         ORDER BY views DESC
         LIMIT $4`,
        [domainId, startDate, endDate, limit]
    );
}

/**
 * Get timeseries data (pageviews & unique visitors per day/hour).
 */
export async function getTimeseries(
    domainId: string,
    startDate: Date,
    endDate: Date,
    interval: 'hour' | 'day' = 'day'
): Promise<{ bucket: string; pageviews: number; visitors: number }[]> {
    const trunc = interval === 'hour' ? 'hour' : 'day';
    return query<{ bucket: string; pageviews: number; visitors: number }>(
        `SELECT
            date_trunc($4, created_at)::text as bucket,
            COUNT(*) FILTER (WHERE type = 'pageview')::int as pageviews,
            COUNT(DISTINCT visitor_id)::int as visitors
         FROM events
         WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3
         GROUP BY bucket
         ORDER BY bucket`,
        [domainId, startDate, endDate, trunc]
    );
}

/**
 * Get recent events (for realtime view).
 */
export async function getRecentEvents(
    domainId: string,
    sinceMinutes: number = 30
): Promise<EventRow[]> {
    return query<EventRow>(
        `SELECT * FROM events
         WHERE domain_id = $1
           AND created_at >= NOW() - ($2 || ' minutes')::interval
         ORDER BY created_at DESC`,
        [domainId, sinceMinutes.toString()]
    );
}

/**
 * Count realtime active visitors (unique visitors in last N minutes).
 */
export async function countRealtimeVisitors(
    domainId: string,
    sinceMinutes: number = 30
): Promise<number> {
    const row = await queryOne<{ count: string }>(
        `SELECT COUNT(DISTINCT visitor_id)::text as count FROM events
         WHERE domain_id = $1
           AND created_at >= NOW() - ($2 || ' minutes')::interval`,
        [domainId, sinceMinutes.toString()]
    );
    return parseInt(row?.count || '0', 10);
}

/**
 * Get events by tracking ID (used by collect route before domain ID is resolved).
 */
export async function queryByTrackingId(
    trackingId: string,
    startDate: Date,
    endDate: Date
): Promise<EventRow[]> {
    return query<EventRow>(
        `SELECT e.* FROM events e
         JOIN domains d ON d.id = e.domain_id
         WHERE d.tracking_id = $1
           AND e.created_at >= $2
           AND e.created_at <= $3
         ORDER BY e.created_at DESC`,
        [trackingId, startDate, endDate]
    );
}

/**
 * Get source breakdown for a domain within a date range.
 */
export async function getSourceBreakdown(
    domainId: string,
    startDate: Date,
    endDate: Date
): Promise<{ utm_source: string | null; referrer: string | null; count: number }[]> {
    return query<{ utm_source: string | null; referrer: string | null; count: number }>(
        `SELECT utm_source, referrer, COUNT(*)::int as count FROM events
         WHERE domain_id = $1 AND created_at >= $2 AND created_at <= $3
         GROUP BY utm_source, referrer
         ORDER BY count DESC`,
        [domainId, startDate, endDate]
    );
}

/**
 * Get sequential user paths (flow from one page to the next).
 */
export async function getUserPaths(
    domainId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
): Promise<{ source_url: string; target_url: string; count: number }[]> {
    return query<{ source_url: string; target_url: string; count: number }>(
        `WITH numbered_events AS (
            SELECT
                url as source_url,
                LEAD(url) OVER (PARTITION BY session_id ORDER BY created_at) as target_url
            FROM events
            WHERE domain_id = $1
              AND created_at >= $2
              AND created_at <= $3
              AND type = 'pageview'
        )
        SELECT source_url, target_url, COUNT(*)::int as count
        FROM numbered_events
        WHERE target_url IS NOT NULL 
          AND source_url != target_url
        GROUP BY source_url, target_url
        ORDER BY count DESC
        LIMIT $4`,
        [domainId, startDate, endDate, limit]
    );
}

/**
 * Get top entry point pages (first page in session) and exit point pages (last page)
 */
export async function getEntriesAndExits(
    domainId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
): Promise<{ url: string; is_entry: boolean; is_exit: boolean; count: number }[]> {
    return query<{ url: string; is_entry: boolean; is_exit: boolean; count: number }>(
        `WITH session_edges AS (
            SELECT
                session_id,
                FIRST_VALUE(url) OVER w AS entry_url,
                LAST_VALUE(url) OVER w AS exit_url
            FROM events
            WHERE domain_id = $1
              AND created_at >= $2
              AND created_at <= $3
              AND type = 'pageview'
            WINDOW w AS (PARTITION BY session_id ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
        ),
        distinct_edges AS (
            SELECT DISTINCT session_id, entry_url, exit_url FROM session_edges
        ),
        entries AS (
            SELECT entry_url as url, true as is_entry, false as is_exit, COUNT(*)::int as count
            FROM distinct_edges
            GROUP BY entry_url
        ),
        exits AS (
            SELECT exit_url as url, false as is_entry, true as is_exit, COUNT(*)::int as count
            FROM distinct_edges
            GROUP BY exit_url
        )
        SELECT * FROM entries
        UNION ALL
        SELECT * FROM exits
        ORDER BY count DESC`,
        [domainId, startDate, endDate]
    );
}
