// ──────────────────────────────────────────────
// Thravic — Custom Event Analytics Routes
// Serves data for: Errors, Performance, Forms, Rage Clicks
// ──────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';
import { authenticate } from '../middleware/auth';
import { createLogger } from '../config/logger';

const log = createLogger('CustomEvents');
const router = Router();

router.use(authenticate);

// ── Helper: parse date range from query params ──
function getDateRange(req: Request): { start: Date; end: Date } {
    const now = new Date();
    const daysBack = parseInt(req.query.days as string) || 30;
    const end = req.query.end ? new Date(req.query.end as string) : now;
    const start = req.query.start ? new Date(req.query.start as string) : new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);
    return { start, end };
}

// ═══════════════════════════════════════════════
//  GET /api/custom-events/:domainId/errors
// ═══════════════════════════════════════════════
router.get('/:domainId/errors', async (req: Request, res: Response) => {
    try {
        const { domainId } = req.params;
        const { start, end } = getDateRange(req);

        // Get error events grouped by message
        const errors = await query<{
            message: string;
            source: string | null;
            count: number;
            first_seen: string;
            last_seen: string;
        }>(
            `SELECT 
                data->>'message' as message,
                data->>'source' as source,
                COUNT(*)::int as count,
                MIN(created_at)::text as first_seen,
                MAX(created_at)::text as last_seen
             FROM events
             WHERE domain_id = $1
               AND type = 'custom'
               AND data->>'event' = 'error'
               AND created_at >= $2
               AND created_at <= $3
             GROUP BY data->>'message', data->>'source'
             ORDER BY count DESC
             LIMIT 100`,
            [domainId, start, end]
        );

        // Get total error count
        const totalRow = await queryOne<{ count: string }>(
            `SELECT COUNT(*)::text as count FROM events
             WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'error'
               AND created_at >= $2 AND created_at <= $3`,
            [domainId, start, end]
        );

        // Get error trend (counts per day)
        const trend = await query<{ day: string; count: number }>(
            `SELECT date_trunc('day', created_at)::date::text as day, COUNT(*)::int as count
             FROM events
             WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'error'
               AND created_at >= $2 AND created_at <= $3
             GROUP BY day ORDER BY day`,
            [domainId, start, end]
        );

        res.json({
            totalErrors: parseInt(totalRow?.count || '0', 10),
            errors,
            trend,
        });
    } catch (error) {
        log.error('Error fetching error events', error);
        res.status(500).json({ error: 'Failed to fetch error data' });
    }
});

// ═══════════════════════════════════════════════
//  GET /api/custom-events/:domainId/performance
// ═══════════════════════════════════════════════
router.get('/:domainId/performance', async (req: Request, res: Response) => {
    try {
        const { domainId } = req.params;
        const { start, end } = getDateRange(req);

        // Get average Web Vitals
        const metrics = await queryOne<{
            avg_lcp: number;
            avg_fid: number;
            avg_cls: number;
            avg_ttfb: number;
            avg_fcp: number;
            avg_load_time: number;
            sample_count: number;
        }>(
            `SELECT 
                ROUND(AVG((data->>'lcp')::numeric))::int as avg_lcp,
                ROUND(AVG((data->>'fid')::numeric))::int as avg_fid,
                ROUND(AVG((data->>'cls')::numeric * 1000)) / 1000.0 as avg_cls,
                ROUND(AVG((data->>'ttfb')::numeric))::int as avg_ttfb,
                ROUND(AVG((data->>'fcp')::numeric))::int as avg_fcp,
                ROUND(AVG((data->>'loadTime')::numeric))::int as avg_load_time,
                COUNT(*)::int as sample_count
             FROM events
             WHERE domain_id = $1
               AND type = 'custom'
               AND data->>'event' = 'performance'
               AND created_at >= $2
               AND created_at <= $3`,
            [domainId, start, end]
        );

        // Get daily trend of LCP
        const trend = await query<{ day: string; avg_lcp: number; avg_fcp: number }>(
            `SELECT 
                date_trunc('day', created_at)::date::text as day,
                ROUND(AVG((data->>'lcp')::numeric))::int as avg_lcp,
                ROUND(AVG((data->>'fcp')::numeric))::int as avg_fcp
             FROM events
             WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'performance'
               AND created_at >= $2 AND created_at <= $3
             GROUP BY day ORDER BY day`,
            [domainId, start, end]
        );

        // Performance by page
        const byPage = await query<{ url: string; avg_lcp: number; avg_fcp: number; count: number }>(
            `SELECT 
                url,
                ROUND(AVG((data->>'lcp')::numeric))::int as avg_lcp,
                ROUND(AVG((data->>'fcp')::numeric))::int as avg_fcp,
                COUNT(*)::int as count
             FROM events
             WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'performance'
               AND created_at >= $2 AND created_at <= $3
             GROUP BY url
             ORDER BY count DESC
             LIMIT 20`,
            [domainId, start, end]
        );

        res.json({ metrics, trend, byPage });
    } catch (error) {
        log.error('Error fetching performance data', error);
        res.status(500).json({ error: 'Failed to fetch performance data' });
    }
});

// ═══════════════════════════════════════════════
//  GET /api/custom-events/:domainId/forms
// ═══════════════════════════════════════════════
router.get('/:domainId/forms', async (req: Request, res: Response) => {
    try {
        const { domainId } = req.params;
        const { start, end } = getDateRange(req);

        // Get form submissions grouped by form identifier
        const forms = await query<{
            form_id: string | null;
            form_name: string | null;
            action: string | null;
            method: string | null;
            submissions: number;
            avg_fields: number;
            pages: number;
        }>(
            `SELECT 
                data->>'formId' as form_id,
                data->>'formName' as form_name,
                data->>'action' as action,
                data->>'method' as method,
                COUNT(*)::int as submissions,
                ROUND(AVG((data->>'fieldCount')::numeric))::int as avg_fields,
                COUNT(DISTINCT url)::int as pages
             FROM events
             WHERE domain_id = $1
               AND type = 'form'
               AND created_at >= $2
               AND created_at <= $3
             GROUP BY data->>'formId', data->>'formName', data->>'action', data->>'method'
             ORDER BY submissions DESC
             LIMIT 50`,
            [domainId, start, end]
        );

        // Total submissions
        const totalRow = await queryOne<{ count: string }>(
            `SELECT COUNT(*)::text as count FROM events
             WHERE domain_id = $1 AND type = 'form'
               AND created_at >= $2 AND created_at <= $3`,
            [domainId, start, end]
        );

        // Daily trend
        const trend = await query<{ day: string; count: number }>(
            `SELECT date_trunc('day', created_at)::date::text as day, COUNT(*)::int as count
             FROM events
             WHERE domain_id = $1 AND type = 'form'
               AND created_at >= $2 AND created_at <= $3
             GROUP BY day ORDER BY day`,
            [domainId, start, end]
        );

        res.json({
            totalSubmissions: parseInt(totalRow?.count || '0', 10),
            forms,
            trend,
        });
    } catch (error) {
        log.error('Error fetching form data', error);
        res.status(500).json({ error: 'Failed to fetch form data' });
    }
});

// ═══════════════════════════════════════════════
//  GET /api/custom-events/:domainId/rage-clicks
// ═══════════════════════════════════════════════
router.get('/:domainId/rage-clicks', async (req: Request, res: Response) => {
    try {
        const { domainId } = req.params;
        const { start, end } = getDateRange(req);

        // Get rage clicks grouped by element
        const rageClicks = await query<{
            tag: string | null;
            element_id: string | null;
            text: string | null;
            url: string;
            count: number;
            avg_click_count: number;
        }>(
            `SELECT 
                data->>'tag' as tag,
                data->>'id' as element_id,
                data->>'text' as text,
                url,
                COUNT(*)::int as count,
                ROUND(AVG((data->>'clickCount')::numeric))::int as avg_click_count
             FROM events
             WHERE domain_id = $1
               AND type = 'custom'
               AND data->>'event' = 'rage_click'
               AND created_at >= $2
               AND created_at <= $3
             GROUP BY data->>'tag', data->>'id', data->>'text', url
             ORDER BY count DESC
             LIMIT 50`,
            [domainId, start, end]
        );

        // Total rage click count
        const totalRow = await queryOne<{ count: string }>(
            `SELECT COUNT(*)::text as count FROM events
             WHERE domain_id = $1 AND type = 'custom' AND data->>'event' = 'rage_click'
               AND created_at >= $2 AND created_at <= $3`,
            [domainId, start, end]
        );

        res.json({
            totalRageClicks: parseInt(totalRow?.count || '0', 10),
            rageClicks,
        });
    } catch (error) {
        log.error('Error fetching rage click data', error);
        res.status(500).json({ error: 'Failed to fetch rage click data' });
    }
});

export default router;
