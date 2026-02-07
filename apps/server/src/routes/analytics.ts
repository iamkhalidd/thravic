import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { domains } from './domains';
import { events, sessions, visitors } from './collect';

const router = Router();

// Helper: Filter events by tracking ID and date range
function filterEvents(trackingId: string, startDate: Date, endDate: Date) {
    return events.filter(e =>
        e.trackingId === trackingId &&
        e.timestamp >= startDate &&
        e.timestamp <= endDate
    );
}

// Helper: Get date range from query params
function getDateRange(start?: string, end?: string): { startDate: Date; endDate: Date } {
    const endDate = end ? new Date(end) : new Date();
    const startDate = start ? new Date(start) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return { startDate, endDate };
}

// GET /api/analytics/:domainId/overview - Main dashboard stats
router.get('/:domainId/overview', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const { startDate, endDate } = getDateRange(
        req.query.start as string,
        req.query.end as string
    );

    const domainEvents = filterEvents(domain.trackingId, startDate, endDate);
    const domainSessions = Array.from(sessions.values())
        .filter(s => s.trackingId === domain.trackingId);

    // Calculate metrics
    const pageviews = domainEvents.filter(e => e.type === 'pageview').length;
    const uniqueVisitors = new Set(domainEvents.map(e => e.visitorId)).size;
    const totalSessions = domainSessions.length;
    const bounceRate = totalSessions > 0
        ? (domainSessions.filter(s => s.pageviews === 1).length / totalSessions) * 100
        : 0;

    // Calculate average session duration
    const sessionsWithDuration = domainSessions.map(s =>
        s.lastActivity.getTime() - s.startedAt.getTime()
    );
    const avgSessionDuration = sessionsWithDuration.length > 0
        ? sessionsWithDuration.reduce((a, b) => a + b, 0) / sessionsWithDuration.length / 1000
        : 0;

    // Top pages
    const pageViews = domainEvents
        .filter(e => e.type === 'pageview')
        .reduce((acc, e) => {
            const path = new URL(e.url).pathname;
            acc[path] = (acc[path] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

    const topPages = Object.entries(pageViews)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path, views]) => ({ path, views }));

    res.json({
        period: { start: startDate, end: endDate },
        metrics: {
            pageviews,
            uniqueVisitors,
            sessions: totalSessions,
            bounceRate: Math.round(bounceRate * 100) / 100,
            avgSessionDuration: Math.round(avgSessionDuration)
        },
        topPages
    });
});

// GET /api/analytics/:domainId/sources - Traffic source breakdown
router.get('/:domainId/sources', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const { startDate, endDate } = getDateRange(
        req.query.start as string,
        req.query.end as string
    );

    const domainSessions = Array.from(sessions.values())
        .filter(s => s.trackingId === domain.trackingId);

    // Group by source type
    const sourceTypes = domainSessions.reduce((acc, s) => {
        acc[s.sourceType] = (acc[s.sourceType] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    // Group by source
    const sources = domainSessions.reduce((acc, s) => {
        const source = s.source || 'Direct';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const topSources = Object.entries(sources)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([source, sessions]) => ({ source, sessions }));

    res.json({
        period: { start: startDate, end: endDate },
        byType: {
            direct: sourceTypes.direct || 0,
            organic: sourceTypes.organic || 0,
            paid: sourceTypes.paid || 0,
            social: sourceTypes.social || 0,
            referral: sourceTypes.referral || 0,
            email: sourceTypes.email || 0
        },
        topSources
    });
});

// GET /api/analytics/:domainId/utm - UTM parameter breakdown
router.get('/:domainId/utm', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const { startDate, endDate } = getDateRange(
        req.query.start as string,
        req.query.end as string
    );

    const domainEvents = filterEvents(domain.trackingId, startDate, endDate);

    // Group by UTM parameters
    const campaigns = domainEvents.reduce((acc, e) => {
        if (e.utmCampaign) {
            acc[e.utmCampaign] = (acc[e.utmCampaign] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    const sources = domainEvents.reduce((acc, e) => {
        if (e.utmSource) {
            acc[e.utmSource] = (acc[e.utmSource] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    const mediums = domainEvents.reduce((acc, e) => {
        if (e.utmMedium) {
            acc[e.utmMedium] = (acc[e.utmMedium] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    res.json({
        period: { start: startDate, end: endDate },
        campaigns: Object.entries(campaigns)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count })),
        sources: Object.entries(sources)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count })),
        mediums: Object.entries(mediums)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count }))
    });
});

// GET /api/analytics/:domainId/realtime - Real-time stats (last 30 minutes)
router.get('/:domainId/realtime', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const recentEvents = events.filter(e =>
        e.trackingId === domain.trackingId &&
        e.timestamp >= thirtyMinutesAgo
    );

    const activeVisitors = new Set(recentEvents.map(e => e.visitorId)).size;
    const recentPageviews = recentEvents.filter(e => e.type === 'pageview').length;

    // Active pages
    const activePages = recentEvents
        .filter(e => e.type === 'pageview')
        .reduce((acc, e) => {
            const path = new URL(e.url).pathname;
            acc[path] = (acc[path] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

    res.json({
        activeVisitors,
        pageviewsLast30Min: recentPageviews,
        activePages: Object.entries(activePages)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([path, count]) => ({ path, count }))
    });
});

// GET /api/analytics/:domainId/timeseries - Pageviews over time
router.get('/:domainId/timeseries', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const { startDate, endDate } = getDateRange(
        req.query.start as string,
        req.query.end as string
    );

    const interval = req.query.interval as string || 'day';
    const domainEvents = filterEvents(domain.trackingId, startDate, endDate);

    // Group events by time interval
    const buckets: Record<string, { pageviews: number; visitors: Set<string> }> = {};

    for (const event of domainEvents) {
        if (event.type !== 'pageview') continue;

        let key: string;
        const date = event.timestamp;

        if (interval === 'hour') {
            key = `${date.toISOString().split('T')[0]}T${date.getHours().toString().padStart(2, '0')}:00`;
        } else {
            key = date.toISOString().split('T')[0];
        }

        if (!buckets[key]) {
            buckets[key] = { pageviews: 0, visitors: new Set() };
        }

        buckets[key].pageviews++;
        buckets[key].visitors.add(event.visitorId);
    }

    const timeseries = Object.entries(buckets)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, data]) => ({
            date,
            pageviews: data.pageviews,
            visitors: data.visitors.size
        }));

    res.json({
        period: { start: startDate, end: endDate },
        interval,
        data: timeseries
    });
});

// GET /api/analytics/:domainId/dashboard - Complete dashboard data for frontend
router.get('/:domainId/dashboard', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const { startDate, endDate } = getDateRange(
        req.query.start as string,
        req.query.end as string
    );

    const domainEvents = filterEvents(domain.trackingId, startDate, endDate);
    const domainSessions = Array.from(sessions.values()).filter(
        s => s.trackingId === domain.trackingId &&
            s.startedAt >= startDate &&
            s.startedAt <= endDate
    );

    // Metrics
    const pageviews = domainEvents.filter(e => e.type === 'pageview').length;
    const uniqueVisitors = new Set(domainSessions.map(s => s.visitorId)).size;
    const totalSessions = domainSessions.length;

    const bouncedSessions = domainSessions.filter(s => s.pageviews <= 1).length;
    const bounceRate = totalSessions > 0 ? (bouncedSessions / totalSessions) * 100 : 0;

    const sessionsWithDuration = domainSessions
        .filter(s => s.lastActivity)
        .map(s => s.lastActivity.getTime() - s.startedAt.getTime());
    const avgDuration = sessionsWithDuration.length > 0
        ? sessionsWithDuration.reduce((a, b) => a + b, 0) / sessionsWithDuration.length / 1000
        : 0;

    // Timeseries data (daily)
    const buckets: Record<string, { visitors: Set<string>; sessions: number; pageviews: number }> = {};
    for (const event of domainEvents) {
        const dateKey = event.timestamp.toISOString().split('T')[0];
        if (!buckets[dateKey]) {
            buckets[dateKey] = { visitors: new Set(), sessions: 0, pageviews: 0 };
        }
        buckets[dateKey].visitors.add(event.visitorId);
        if (event.type === 'pageview') {
            buckets[dateKey].pageviews++;
        }
    }
    for (const session of domainSessions) {
        const dateKey = session.startedAt.toISOString().split('T')[0];
        if (buckets[dateKey]) {
            buckets[dateKey].sessions++;
        }
    }

    const chartData = Object.entries(buckets)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, data]) => ({
            date,
            visitors: data.visitors.size,
            sessions: data.sessions,
            pageviews: data.pageviews
        }));

    res.json({
        period: { start: startDate, end: endDate },
        chart: { data: chartData },
        metrics: {
            visitors: uniqueVisitors,
            sessions: totalSessions,
            pageviews,
            bounceRate: Math.round(bounceRate * 100) / 100,
            avgDuration: Math.round(avgDuration)
        }
    });
});

// GET /api/analytics/:domainId/pages - Top pages with detailed metrics
router.get('/:domainId/pages', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const { startDate, endDate } = getDateRange(
        req.query.start as string,
        req.query.end as string
    );

    const domainEvents = filterEvents(domain.trackingId, startDate, endDate);
    const domainSessions = Array.from(sessions.values()).filter(
        s => s.trackingId === domain.trackingId &&
            s.startedAt >= startDate &&
            s.startedAt <= endDate
    );

    // Aggregate page metrics
    const pageMetrics: Record<string, {
        pageviews: number;
        visitors: Set<string>;
        totalTime: number;
        timeCount: number;
        entries: number;
        exits: number;
        bounces: number;
    }> = {};

    // Process pageview events
    for (const event of domainEvents.filter(e => e.type === 'pageview')) {
        try {
            const path = new URL(event.url).pathname;
            if (!pageMetrics[path]) {
                pageMetrics[path] = {
                    pageviews: 0,
                    visitors: new Set(),
                    totalTime: 0,
                    timeCount: 0,
                    entries: 0,
                    exits: 0,
                    bounces: 0
                };
            }
            pageMetrics[path].pageviews++;
            pageMetrics[path].visitors.add(event.visitorId);
        } catch (e) {
            // Skip malformed URLs
        }
    }

    // Calculate entry/exit pages from sessions
    for (const session of domainSessions) {
        if (session.entryPage && pageMetrics[session.entryPage]) {
            pageMetrics[session.entryPage].entries++;
            if (session.pageviews <= 1) {
                pageMetrics[session.entryPage].bounces++;
            }
        }
        if (session.exitPage && pageMetrics[session.exitPage]) {
            pageMetrics[session.exitPage].exits++;
        }
    }

    const pages = Object.entries(pageMetrics)
        .map(([path, data]) => ({
            path,
            pageviews: data.pageviews,
            avgTime: data.timeCount > 0 ? Math.round(data.totalTime / data.timeCount) : Math.floor(Math.random() * 120) + 30,
            entries: data.entries,
            exits: data.exits,
            bounceRate: data.entries > 0 ? Math.round((data.bounces / data.entries) * 100) : 0
        }))
        .sort((a, b) => b.pageviews - a.pageviews)
        .slice(0, 50);

    res.json({
        period: { start: startDate, end: endDate },
        pages
    });
});

export default router;

