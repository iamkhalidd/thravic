// ──────────────────────────────────────────────
// TrackFlow — Session Service
// ──────────────────────────────────────────────
import { query, queryOne } from '../db';

export interface SessionRow {
    id: string;
    session_id: string;
    visitor_id: string | null;
    domain_id: string;
    started_at: Date;
    ended_at: Date | null;
    pageviews: number;
    source: string | null;
    source_type: string | null;
    referrer: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_term: string | null;
    utm_content: string | null;
    user_agent: string | null;
    screen_width: number | null;
    screen_height: number | null;
    language: string | null;
}

export interface UpsertSessionParams {
    sessionId: string;
    domainId: string;
    visitorId?: string;
    source?: string | null;
    sourceType?: string;
    referrer?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmTerm?: string | null;
    utmContent?: string | null;
    userAgent?: string | null;
    screenWidth?: number | null;
    screenHeight?: number | null;
    language?: string | null;
    country?: string | null;
    region?: string | null;
    city?: string | null;
}

/**
 * Insert or update a session. On conflict (same session_id + domain_id),
 * increment pageviews and update the ended_at timestamp.
 */
export async function upsert(params: UpsertSessionParams): Promise<SessionRow> {
    const rows = await query<SessionRow>(
        `INSERT INTO sessions
            (session_id, domain_id, visitor_id, source, source_type, referrer,
             utm_source, utm_medium, utm_campaign, utm_term, utm_content,
             user_agent, screen_width, screen_height, language, 
             country, region, city, pageviews)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 1)
         ON CONFLICT (session_id, domain_id)
         DO UPDATE SET
            pageviews = sessions.pageviews + 1,
            ended_at = NOW()
         RETURNING *`,
        [
            params.sessionId,
            params.domainId,
            params.visitorId || null,
            params.source || null,
            params.sourceType || null,
            params.referrer || null,
            params.utmSource || null,
            params.utmMedium || null,
            params.utmCampaign || null,
            params.utmTerm || null,
            params.utmContent || null,
            params.userAgent || null,
            params.screenWidth || null,
            params.screenHeight || null,
            params.language || null,
            params.country || null,
            params.region || null,
            params.city || null,
        ]
    );

    return rows[0];
}

/**
 * Get sessions for a domain within a date range.
 */
export async function queryByDomain(
    domainId: string,
    startDate: Date,
    endDate: Date
): Promise<SessionRow[]> {
    return query<SessionRow>(
        `SELECT * FROM sessions
         WHERE domain_id = $1
           AND started_at >= $2
           AND started_at <= $3
         ORDER BY started_at DESC`,
        [domainId, startDate, endDate]
    );
}

/**
 * Count total sessions for a domain within a date range.
 */
export async function countByDomain(
    domainId: string,
    startDate: Date,
    endDate: Date
): Promise<number> {
    const row = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM sessions
         WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3`,
        [domainId, startDate, endDate]
    );
    return parseInt(row?.count || '0', 10);
}

/**
 * Get bounce rate (sessions with only 1 pageview).
 */
export async function getBounceRate(
    domainId: string,
    startDate: Date,
    endDate: Date
): Promise<number> {
    const row = await queryOne<{ total: string; bounced: string }>(
        `SELECT
            COUNT(*)::text as total,
            COUNT(*) FILTER (WHERE pageviews <= 1)::text as bounced
         FROM sessions
         WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3`,
        [domainId, startDate, endDate]
    );
    const total = parseInt(row?.total || '0', 10);
    const bounced = parseInt(row?.bounced || '0', 10);
    return total > 0 ? Math.round((bounced / total) * 10000) / 100 : 0;
}

/**
 * Get average session duration in seconds.
 */
export async function getAvgDuration(
    domainId: string,
    startDate: Date,
    endDate: Date
): Promise<number> {
    const row = await queryOne<{ avg_duration: string }>(
        `SELECT COALESCE(
            AVG(EXTRACT(EPOCH FROM (COALESCE(ended_at, started_at) - started_at))),
            0
         )::text as avg_duration
         FROM sessions
         WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3`,
        [domainId, startDate, endDate]
    );
    return Math.round(parseFloat(row?.avg_duration || '0'));
}

/**
 * Get source type breakdown for a domain within a date range.
 */
export async function getSourceTypeBreakdown(
    domainId: string,
    startDate: Date,
    endDate: Date
): Promise<{ source_type: string; count: number }[]> {
    return query<{ source_type: string; count: number }>(
        `SELECT COALESCE(source_type, 'direct') as source_type, COUNT(*)::int as count
         FROM sessions
         WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3
         GROUP BY source_type
         ORDER BY count DESC`,
        [domainId, startDate, endDate]
    );
}

/**
 * Get top referrer domains.
 */
export async function getTopReferrers(
    domainId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
): Promise<{ referrer: string; sessions: number; visitors: number }[]> {
    return query<{ referrer: string; sessions: number; visitors: number }>(
        `SELECT
            referrer,
            COUNT(*)::int as sessions,
            COUNT(DISTINCT visitor_id)::int as visitors
         FROM sessions
         WHERE domain_id = $1 AND started_at >= $2 AND started_at <= $3
           AND referrer IS NOT NULL AND referrer != ''
         GROUP BY referrer
         ORDER BY sessions DESC
         LIMIT $4`,
        [domainId, startDate, endDate, limit]
    );
}

/**
 * Get realtime active sessions (within last N minutes).
 */
export async function getRealtimeActiveSessions(
    domainId: string,
    sinceMinutes: number = 30
): Promise<number> {
    const row = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM sessions
         WHERE domain_id = $1
           AND (ended_at IS NULL OR ended_at >= NOW() - ($2 || ' minutes')::interval)
           AND started_at >= NOW() - ($2 || ' minutes')::interval`,
        [domainId, sinceMinutes.toString()]
    );
    return parseInt(row?.count || '0', 10);
}

/**
 * Classify traffic source based on UTM params and referrer.
 * Returns keys that match the frontend dashboard: direct | organic | paid | social | referral | email
 */
export function classifySource(
    referrer: string | null,
    utmSource: string | null,
    utmMedium: string | null
): string {
    const medium = (utmMedium || '').toLowerCase();
    const source = (utmSource || '').toLowerCase();

    // UTM-based classification (most specific)
    if (medium === 'email' || source === 'email') return 'email';
    if (medium === 'cpc' || medium === 'ppc' || medium === 'paid' || medium === 'paidsearch' || medium === 'paidsocial') return 'paid';
    if (source || medium) return 'paid'; // any other UTM = deliberate campaign = paid/tracked

    // Referrer-based classification
    if (!referrer) return 'direct';

    try {
        const refUrl = new URL(referrer);
        const hostname = refUrl.hostname.toLowerCase().replace(/^www\./, '');

        const searchEngines = ['google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com', 'baidu.com', 'yandex.com', 'ecosia.org', 'brave.com', 'search.yahoo.com'];
        if (searchEngines.some(e => hostname === e || hostname.endsWith('.' + e))) return 'organic';

        const socialNetworks = ['facebook.com', 'twitter.com', 'x.com', 't.co', 'linkedin.com', 'instagram.com', 'pinterest.com', 'tiktok.com', 'reddit.com', 'youtube.com', 'snapchat.com', 'telegram.org', 'whatsapp.com'];
        if (socialNetworks.some(s => hostname === s || hostname.endsWith('.' + s))) return 'social';
    } catch {
        // malformed URL — treat as referral
    }

    return 'referral';
}


