import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { domains } from './domains';
import { events, sessions } from './collect';

const router = Router();

// Social platform patterns for detailed breakdown
const socialPlatforms: { name: string; patterns: string[] }[] = [
    { name: 'Twitter / X', patterns: ['twitter.com', 't.co', 'x.com'] },
    { name: 'LinkedIn', patterns: ['linkedin.com', 'lnkd.in'] },
    { name: 'Facebook', patterns: ['facebook.com', 'fb.com', 'fb.me'] },
    { name: 'Instagram', patterns: ['instagram.com', 'instagr.am'] },
    { name: 'YouTube', patterns: ['youtube.com', 'youtu.be'] },
    { name: 'TikTok', patterns: ['tiktok.com'] },
    { name: 'Reddit', patterns: ['reddit.com', 'redd.it'] },
    { name: 'Pinterest', patterns: ['pinterest.com', 'pin.it'] }
];

// Search engine patterns
const searchEngines: { name: string; patterns: string[] }[] = [
    { name: 'Google', patterns: ['google.com', 'google.co'] },
    { name: 'Bing', patterns: ['bing.com'] },
    { name: 'Yahoo', patterns: ['yahoo.com', 'search.yahoo'] },
    { name: 'DuckDuckGo', patterns: ['duckduckgo.com'] },
    { name: 'Baidu', patterns: ['baidu.com'] }
];

// Helper: Get date range from query params
function getDateRange(start?: string, end?: string): { startDate: Date; endDate: Date } {
    const endDate = end ? new Date(end) : new Date();
    const startDate = start ? new Date(start) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return { startDate, endDate };
}

// Helper: Identify social platform from referrer
function identifySocialPlatform(referrer: string | null): string | null {
    if (!referrer) return null;
    const ref = referrer.toLowerCase();
    for (const platform of socialPlatforms) {
        if (platform.patterns.some(p => ref.includes(p))) {
            return platform.name;
        }
    }
    return null;
}

// Helper: Identify search engine from referrer
function identifySearchEngine(referrer: string | null): string | null {
    if (!referrer) return null;
    const ref = referrer.toLowerCase();
    for (const engine of searchEngines) {
        if (engine.patterns.some(p => ref.includes(p))) {
            return engine.name;
        }
    }
    return null;
}

// Helper: Extract clean referrer domain
function extractReferrerDomain(referrer: string | null): string | null {
    if (!referrer) return null;
    try {
        const url = new URL(referrer);
        return url.hostname.replace('www.', '');
    } catch {
        return null;
    }
}

// GET /api/sources/:domainId/referrers - Top referring websites
router.get('/:domainId/referrers', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);
    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const { startDate, endDate } = getDateRange(
        req.query.start as string,
        req.query.end as string
    );

    // Get all sessions with referrers
    const domainSessions = Array.from(sessions.values())
        .filter(s => s.trackingId === domain.trackingId && s.sourceType === 'referral');

    // Get all pageview events for conversion calculation
    const pageviewEvents = events.filter(e =>
        e.trackingId === domain.trackingId &&
        e.type === 'pageview' &&
        e.timestamp >= startDate &&
        e.timestamp <= endDate
    );

    // Aggregate referrers
    const referrerMap = new Map<string, { visitors: Set<string>; sessions: number; pageviews: number }>();

    for (const session of domainSessions) {
        if (!session.source) continue;
        const domain = extractReferrerDomain(session.source) || session.source;

        if (!referrerMap.has(domain)) {
            referrerMap.set(domain, { visitors: new Set(), sessions: 0, pageviews: 0 });
        }

        const data = referrerMap.get(domain)!;
        data.visitors.add(session.visitorId);
        data.sessions++;
    }

    // Count pageviews per referrer
    for (const event of pageviewEvents) {
        if (!event.referrer) continue;
        const domain = extractReferrerDomain(event.referrer);
        if (domain && referrerMap.has(domain)) {
            referrerMap.get(domain)!.pageviews++;
        }
    }

    const referrers = Array.from(referrerMap.entries())
        .map(([site, data]) => ({
            site,
            visitors: data.visitors.size,
            sessions: data.sessions,
            pageviews: data.pageviews,
            pagesPerSession: data.sessions > 0 ? Math.round((data.pageviews / data.sessions) * 10) / 10 : 0
        }))
        .sort((a, b) => b.visitors - a.visitors)
        .slice(0, 20);

    res.json({
        period: { start: startDate, end: endDate },
        referrers
    });
});

// GET /api/sources/:domainId/social - Social media platform breakdown
router.get('/:domainId/social', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);
    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const { startDate, endDate } = getDateRange(
        req.query.start as string,
        req.query.end as string
    );

    // Get social sessions
    const socialSessions = Array.from(sessions.values())
        .filter(s => s.trackingId === domain.trackingId && s.sourceType === 'social');

    // Aggregate by platform
    const platformMap = new Map<string, { visitors: Set<string>; sessions: number; bounced: number }>();

    for (const session of socialSessions) {
        const platform = identifySocialPlatform(session.source) || 'Other Social';

        if (!platformMap.has(platform)) {
            platformMap.set(platform, { visitors: new Set(), sessions: 0, bounced: 0 });
        }

        const data = platformMap.get(platform)!;
        data.visitors.add(session.visitorId);
        data.sessions++;
        if (session.pageviews <= 1) {
            data.bounced++;
        }
    }

    const platforms = Array.from(platformMap.entries())
        .map(([platform, data]) => ({
            platform,
            visitors: data.visitors.size,
            sessions: data.sessions,
            bounceRate: data.sessions > 0 ? Math.round((data.bounced / data.sessions) * 100) : 0,
            engagement: data.sessions > 0
                ? (data.bounced / data.sessions < 0.4 ? 'High' : data.bounced / data.sessions < 0.6 ? 'Medium' : 'Low')
                : 'N/A'
        }))
        .sort((a, b) => b.visitors - a.visitors);

    res.json({
        period: { start: startDate, end: endDate },
        totalSocialVisitors: socialSessions.length,
        platforms
    });
});

// GET /api/sources/:domainId/search - Search engine breakdown
router.get('/:domainId/search', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);
    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const { startDate, endDate } = getDateRange(
        req.query.start as string,
        req.query.end as string
    );

    // Get organic sessions
    const organicSessions = Array.from(sessions.values())
        .filter(s => s.trackingId === domain.trackingId && s.sourceType === 'organic');

    // Aggregate by search engine
    const engineMap = new Map<string, { visitors: Set<string>; sessions: number }>();

    for (const session of organicSessions) {
        const engine = identifySearchEngine(session.source) || 'Other Search';

        if (!engineMap.has(engine)) {
            engineMap.set(engine, { visitors: new Set(), sessions: 0 });
        }

        const data = engineMap.get(engine)!;
        data.visitors.add(session.visitorId);
        data.sessions++;
    }

    const engines = Array.from(engineMap.entries())
        .map(([engine, data]) => ({
            engine,
            visitors: data.visitors.size,
            sessions: data.sessions,
            share: organicSessions.length > 0
                ? Math.round((data.sessions / organicSessions.length) * 100)
                : 0
        }))
        .sort((a, b) => b.visitors - a.visitors);

    res.json({
        period: { start: startDate, end: endDate },
        totalOrganicSessions: organicSessions.length,
        engines
    });
});

// GET /api/sources/:domainId/campaigns - UTM campaign performance with metrics
router.get('/:domainId/campaigns', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);
    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const { startDate, endDate } = getDateRange(
        req.query.start as string,
        req.query.end as string
    );

    // Get events with UTM campaigns
    const campaignEvents = events.filter(e =>
        e.trackingId === domain.trackingId &&
        e.utmCampaign &&
        e.timestamp >= startDate &&
        e.timestamp <= endDate
    );

    // Aggregate by campaign
    const campaignMap = new Map<string, {
        source: string;
        medium: string;
        visitors: Set<string>;
        sessions: Set<string>;
        pageviews: number;
    }>();

    for (const event of campaignEvents) {
        const campaign = event.utmCampaign!;

        if (!campaignMap.has(campaign)) {
            campaignMap.set(campaign, {
                source: event.utmSource || 'unknown',
                medium: event.utmMedium || 'unknown',
                visitors: new Set(),
                sessions: new Set(),
                pageviews: 0
            });
        }

        const data = campaignMap.get(campaign)!;
        data.visitors.add(event.visitorId);
        data.sessions.add(event.sessionId);
        if (event.type === 'pageview') {
            data.pageviews++;
        }
    }

    const campaigns = Array.from(campaignMap.entries())
        .map(([campaign, data]) => ({
            campaign,
            source: data.source,
            medium: data.medium,
            visitors: data.visitors.size,
            sessions: data.sessions.size,
            pageviews: data.pageviews,
            pagesPerSession: data.sessions.size > 0
                ? Math.round((data.pageviews / data.sessions.size) * 10) / 10
                : 0
        }))
        .sort((a, b) => b.visitors - a.visitors)
        .slice(0, 20);

    res.json({
        period: { start: startDate, end: endDate },
        totalCampaignVisitors: new Set(campaignEvents.map(e => e.visitorId)).size,
        campaigns
    });
});

// GET /api/sources/:domainId/overview - Complete sources overview
router.get('/:domainId/overview', authenticate, (req: AuthRequest, res: Response) => {
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

    // Calculate source type distribution
    const sourceTypes = domainSessions.reduce((acc, s) => {
        acc[s.sourceType] = (acc[s.sourceType] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const total = domainSessions.length || 1;

    // Get top referrers (quick snapshot)
    const referrerCounts = new Map<string, number>();
    for (const session of domainSessions.filter(s => s.sourceType === 'referral')) {
        const domain = extractReferrerDomain(session.source) || session.source || 'unknown';
        referrerCounts.set(domain, (referrerCounts.get(domain) || 0) + 1);
    }
    const topReferrers = Array.from(referrerCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([site, sessions]) => ({ site, sessions }));

    // Get top social platforms (quick snapshot)
    const socialCounts = new Map<string, number>();
    for (const session of domainSessions.filter(s => s.sourceType === 'social')) {
        const platform = identifySocialPlatform(session.source) || 'Other';
        socialCounts.set(platform, (socialCounts.get(platform) || 0) + 1);
    }
    const topSocial = Array.from(socialCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([platform, sessions]) => ({ platform, sessions }));

    // Get top campaigns (quick snapshot)
    const campaignEvents = events.filter(e =>
        e.trackingId === domain.trackingId &&
        e.utmCampaign &&
        e.timestamp >= startDate &&
        e.timestamp <= endDate
    );
    const campaignCounts = new Map<string, number>();
    for (const event of campaignEvents) {
        campaignCounts.set(event.utmCampaign!, (campaignCounts.get(event.utmCampaign!) || 0) + 1);
    }
    const topCampaigns = Array.from(campaignCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([campaign, events]) => ({ campaign, events }));

    res.json({
        period: { start: startDate, end: endDate },
        summary: {
            totalSessions: domainSessions.length,
            byType: {
                direct: { count: sourceTypes.direct || 0, percentage: Math.round(((sourceTypes.direct || 0) / total) * 100) },
                organic: { count: sourceTypes.organic || 0, percentage: Math.round(((sourceTypes.organic || 0) / total) * 100) },
                social: { count: sourceTypes.social || 0, percentage: Math.round(((sourceTypes.social || 0) / total) * 100) },
                referral: { count: sourceTypes.referral || 0, percentage: Math.round(((sourceTypes.referral || 0) / total) * 100) },
                paid: { count: sourceTypes.paid || 0, percentage: Math.round(((sourceTypes.paid || 0) / total) * 100) },
                email: { count: sourceTypes.email || 0, percentage: Math.round(((sourceTypes.email || 0) / total) * 100) }
            }
        },
        topReferrers,
        topSocial,
        topCampaigns
    });
});

export default router;
