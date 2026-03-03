import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { query as dbQuery } from '../db';
import * as domainService from '../services/domainService';
import * as eventService from '../services/eventService';
import * as sessionService from '../services/sessionService';
import { createLogger } from '../config/logger';

const log = createLogger('Analytics');

const router = Router();

// Helper: Get date range from query params
function getDateRange(start?: string, end?: string): { startDate: Date; endDate: Date } {
    const endDate = end ? new Date(end) : new Date();
    const startDate = start ? new Date(start) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { startDate, endDate };
}

// GET /api/analytics/:domainId/overview - Main dashboard stats
router.get('/:domainId/overview', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { startDate, endDate } = getDateRange(
            req.query.start as string,
            req.query.end as string
        );

        const [pageviews, uniqueVisitors, totalSessions, bounceRate, avgSessionDuration, topPages] =
            await Promise.all([
                eventService.countByDomain(domain.id, startDate, endDate, 'pageview'),
                eventService.countUniqueVisitors(domain.id, startDate, endDate),
                sessionService.countByDomain(domain.id, startDate, endDate),
                sessionService.getBounceRate(domain.id, startDate, endDate),
                sessionService.getAvgDuration(domain.id, startDate, endDate),
                eventService.getTopPages(domain.id, startDate, endDate, 10),
            ]);

        res.json({
            period: { start: startDate, end: endDate },
            metrics: { pageviews, uniqueVisitors, sessions: totalSessions, bounceRate, avgSessionDuration },
            topPages: topPages.map(p => {
                try { return { path: new URL(p.url).pathname, views: p.views }; }
                catch { return { path: p.url, views: p.views }; }
            })
        });
    } catch (error) {
        log.error('Analytics overview error', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

// GET /api/analytics/:domainId/sources - Traffic source breakdown
router.get('/:domainId/sources', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { startDate, endDate } = getDateRange(
            req.query.start as string,
            req.query.end as string
        );

        const sourceTypes = await sessionService.getSourceTypeBreakdown(domain.id, startDate, endDate);
        const topReferrers = await sessionService.getTopReferrers(domain.id, startDate, endDate, 20);

        const breakdown: Record<string, number> = {
            direct: 0, organic: 0, paid: 0, social: 0, referral: 0, email: 0
        };
        for (const s of sourceTypes) {
            breakdown[s.source_type] = s.count;
        }

        res.json({
            period: { start: startDate, end: endDate },
            byType: breakdown,
            topSources: topReferrers.map(r => ({
                source: r.referrer,
                visits: r.sessions,
                visitors: r.visitors
            }))
        });
    } catch (error) {
        log.error('Analytics sources error', error);
        res.status(500).json({ error: 'Failed to get source data' });
    }
});

// GET /api/analytics/:domainId/utm - UTM parameter breakdown
router.get('/:domainId/utm', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { startDate, endDate } = getDateRange(
            req.query.start as string,
            req.query.end as string
        );

        const breakdown = await eventService.getSourceBreakdown(domain.id, startDate, endDate);

        // Group by UTM source
        const campaigns: Record<string, number> = {};
        const sources: Record<string, number> = {};
        for (const row of breakdown) {
            if (row.utm_source) {
                sources[row.utm_source] = (sources[row.utm_source] || 0) + row.count;
            }
        }

        res.json({
            period: { start: startDate, end: endDate },
            campaigns: Object.entries(campaigns)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => ({ name, count })),
            sources: Object.entries(sources)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => ({ name, count }))
        });
    } catch (error) {
        log.error('Analytics UTM error', error);
        res.status(500).json({ error: 'Failed to get UTM data' });
    }
});

// GET /api/analytics/:domainId/realtime - Real-time stats (last 30 minutes)
router.get('/:domainId/realtime', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const [activeVisitors, recentEvents] = await Promise.all([
            eventService.countRealtimeVisitors(domain.id, 30),
            eventService.getRecentEvents(domain.id, 30),
        ]);

        // Count pageviews in the last 30 minutes
        const pageviewsLast30Min = recentEvents.filter(e => e.type === 'pageview').length;

        // Active pages
        const pageMap: Record<string, number> = {};
        for (const e of recentEvents) {
            if (e.type === 'pageview') {
                try {
                    const path = new URL(e.url).pathname;
                    pageMap[path] = (pageMap[path] || 0) + 1;
                } catch {
                    pageMap[e.url] = (pageMap[e.url] || 0) + 1;
                }
            }
        }

        res.json({
            activeVisitors,
            pageviewsLast30Min,
            activePages: Object.entries(pageMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([path, count]) => ({ path, count }))
        });
    } catch (error) {
        log.error('Analytics realtime error', error);
        res.status(500).json({ error: 'Failed to get realtime data' });
    }
});

// GET /api/analytics/:domainId/timeseries - Pageviews over time
router.get('/:domainId/timeseries', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { startDate, endDate } = getDateRange(
            req.query.start as string,
            req.query.end as string
        );

        // Auto-detect interval
        const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        const interval: 'hour' | 'day' = diffDays <= 2 ? 'hour' : 'day';

        const data = await eventService.getTimeseries(domain.id, startDate, endDate, interval);

        res.json({
            period: { start: startDate, end: endDate },
            interval,
            data: data.map(d => ({
                date: d.bucket,
                pageviews: d.pageviews,
                visitors: d.visitors
            }))
        });
    } catch (error) {
        log.error('Analytics timeseries error', error);
        res.status(500).json({ error: 'Failed to get timeseries data' });
    }
});

// GET /api/analytics/:domainId/dashboard - Complete dashboard data
router.get('/:domainId/dashboard', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { startDate, endDate } = getDateRange(
            req.query.start as string,
            req.query.end as string
        );

        const [
            pageviews,
            uniqueVisitors,
            totalSessions,
            bounceRate,
            avgSessionDuration,
            topPages,
            timeseries,
            sourceTypes,
            activeVisitors,
        ] = await Promise.all([
            eventService.countByDomain(domain.id, startDate, endDate, 'pageview'),
            eventService.countUniqueVisitors(domain.id, startDate, endDate),
            sessionService.countByDomain(domain.id, startDate, endDate),
            sessionService.getBounceRate(domain.id, startDate, endDate),
            sessionService.getAvgDuration(domain.id, startDate, endDate),
            eventService.getTopPages(domain.id, startDate, endDate, 10),
            eventService.getTimeseries(domain.id, startDate, endDate),
            sessionService.getSourceTypeBreakdown(domain.id, startDate, endDate),
            eventService.countRealtimeVisitors(domain.id, 30),
        ]);

        const sourceBreakdown: Record<string, number> = {
            direct: 0, organic: 0, paid: 0, social: 0, referral: 0, email: 0
        };
        for (const s of sourceTypes) {
            sourceBreakdown[s.source_type] = s.count;
        }

        res.json({
            period: { start: startDate, end: endDate },
            metrics: {
                pageviews,
                uniqueVisitors,
                sessions: totalSessions,
                bounceRate,
                avgSessionDuration
            },
            topPages: topPages.map(p => {
                try { return { path: new URL(p.url).pathname, views: p.views }; }
                catch { return { path: p.url, views: p.views }; }
            }),
            timeseries: timeseries.map(d => ({
                date: d.bucket,
                pageviews: d.pageviews,
                visitors: d.visitors
            })),
            sources: sourceBreakdown,
            realtime: { activeVisitors }
        });
    } catch (error) {
        log.error('Analytics dashboard error', error);
        res.status(500).json({ error: 'Failed to get dashboard data' });
    }
});

// GET /api/analytics/:domainId/pages - Detailed page analysis
router.get('/:domainId/pages', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { startDate, endDate } = getDateRange(
            req.query.start as string,
            req.query.end as string
        );

        const topPages = await eventService.getTopPages(domain.id, startDate, endDate, 50);

        res.json({
            period: { start: startDate, end: endDate },
            pages: topPages.map(p => {
                try { return { path: new URL(p.url).pathname, views: p.views }; }
                catch { return { path: p.url, views: p.views }; }
            })
        });
    } catch (error) {
        log.error('Analytics pages error', error);
        res.status(500).json({ error: 'Failed to get page data' });
    }
});

// GET /api/analytics/:domainId/devices - Device, browser & OS breakdown
router.get('/:domainId/devices', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { startDate, endDate } = getDateRange(
            req.query.start as string,
            req.query.end as string
        );

        // Device type from screen_width (mobile < 768, tablet 768-1024, desktop > 1024)
        const deviceRows = await dbQuery<{ device: string; count: number }>(
            `SELECT
                CASE
                    WHEN s.screen_width IS NULL THEN 'unknown'
                    WHEN s.screen_width < 768 THEN 'mobile'
                    WHEN s.screen_width < 1024 THEN 'tablet'
                    ELSE 'desktop'
                END AS device,
                COUNT(DISTINCT s.session_id)::int AS count
             FROM sessions s
             WHERE s.domain_id = $1
               AND s.started_at >= $2
               AND s.started_at <= $3
             GROUP BY 1
             ORDER BY count DESC`,
            [domain.id, startDate, endDate]
        );

        // Browser from user_agent substring matching
        const browserRows = await dbQuery<{ browser: string; count: number }>(
            `SELECT
                CASE
                    WHEN s.user_agent ILIKE '%Edg/%' OR s.user_agent ILIKE '%Edge/%' THEN 'Edge'
                    WHEN s.user_agent ILIKE '%OPR/%' OR s.user_agent ILIKE '%Opera%' THEN 'Opera'
                    WHEN s.user_agent ILIKE '%Firefox/%' THEN 'Firefox'
                    WHEN s.user_agent ILIKE '%Chrome/%' AND s.user_agent NOT ILIKE '%Chromium%' THEN 'Chrome'
                    WHEN s.user_agent ILIKE '%Safari/%' AND s.user_agent NOT ILIKE '%Chrome%' THEN 'Safari'
                    WHEN s.user_agent ILIKE '%Chromium%' THEN 'Chromium'
                    WHEN s.user_agent IS NULL THEN 'Unknown'
                    ELSE 'Other'
                END AS browser,
                COUNT(DISTINCT s.session_id)::int AS count
             FROM sessions s
             WHERE s.domain_id = $1
               AND s.started_at >= $2
               AND s.started_at <= $3
             GROUP BY 1
             ORDER BY count DESC`,
            [domain.id, startDate, endDate]
        );

        // OS from user_agent
        const osRows = await dbQuery<{ os: string; count: number }>(
            `SELECT
                CASE
                    WHEN s.user_agent ILIKE '%Windows%' THEN 'Windows'
                    WHEN s.user_agent ILIKE '%iPhone%' OR s.user_agent ILIKE '%iPad%' THEN 'iOS'
                    WHEN s.user_agent ILIKE '%Macintosh%' OR s.user_agent ILIKE '%Mac OS%' THEN 'macOS'
                    WHEN s.user_agent ILIKE '%Android%' THEN 'Android'
                    WHEN s.user_agent ILIKE '%Linux%' THEN 'Linux'
                    WHEN s.user_agent IS NULL THEN 'Unknown'
                    ELSE 'Other'
                END AS os,
                COUNT(DISTINCT s.session_id)::int AS count
             FROM sessions s
             WHERE s.domain_id = $1
               AND s.started_at >= $2
               AND s.started_at <= $3
             GROUP BY 1
             ORDER BY count DESC`,
            [domain.id, startDate, endDate]
        );

        const total = (deviceRows as any[]).reduce((sum, r) => sum + r.count, 0) || 1;

        res.json({
            period: { start: startDate, end: endDate },
            devices: (deviceRows as any[]).map(r => ({
                name: r.device.charAt(0).toUpperCase() + r.device.slice(1),
                sessions: r.count,
                percentage: Math.round((r.count / total) * 100)
            })),
            browsers: (browserRows as any[]).map(r => ({
                name: r.browser,
                sessions: r.count,
                percentage: Math.round((r.count / total) * 100)
            })),
            operatingSystems: (osRows as any[]).map(r => ({
                name: r.os,
                sessions: r.count,
                percentage: Math.round((r.count / total) * 100)
            }))
        });
    } catch (error) {
        log.error('Analytics devices error', error);
        res.status(500).json({ error: 'Failed to get device data' });
    }
});

export default router;
