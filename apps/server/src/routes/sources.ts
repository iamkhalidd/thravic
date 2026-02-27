import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as domainService from '../services/domainService';
import * as eventService from '../services/eventService';
import { createLogger } from '../config/logger';

const log = createLogger('Sources');
import * as sessionService from '../services/sessionService';

const router = Router();

// Social platform patterns
const SOCIAL_PLATFORMS = [
    { name: 'Facebook', patterns: ['facebook.com', 'fb.com', 'fb.me'] },
    { name: 'Twitter/X', patterns: ['twitter.com', 'x.com', 't.co'] },
    { name: 'LinkedIn', patterns: ['linkedin.com', 'lnkd.in'] },
    { name: 'Instagram', patterns: ['instagram.com'] },
    { name: 'YouTube', patterns: ['youtube.com', 'youtu.be'] },
    { name: 'TikTok', patterns: ['tiktok.com'] },
    { name: 'Reddit', patterns: ['reddit.com'] },
    { name: 'Pinterest', patterns: ['pinterest.com'] },
];

const SEARCH_ENGINES = [
    { name: 'Google', patterns: ['google.com', 'google.co'] },
    { name: 'Bing', patterns: ['bing.com'] },
    { name: 'Yahoo', patterns: ['yahoo.com', 'search.yahoo'] },
    { name: 'DuckDuckGo', patterns: ['duckduckgo.com'] },
    { name: 'Baidu', patterns: ['baidu.com'] },
];

function getDateRange(start?: string, end?: string) {
    const endDate = end ? new Date(end) : new Date();
    const startDate = start ? new Date(start) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { startDate, endDate };
}

function identifyPlatform(referrer: string | null, platforms: typeof SOCIAL_PLATFORMS): string | null {
    if (!referrer) return null;
    try {
        const host = new URL(referrer).hostname.replace('www.', '');
        for (const p of platforms) {
            if (p.patterns.some(pattern => host.includes(pattern))) return p.name;
        }
    } catch { /* ignore */ }
    return null;
}

function extractDomain(referrer: string | null): string | null {
    if (!referrer) return null;
    try {
        return new URL(referrer).hostname.replace('www.', '');
    } catch {
        return null;
    }
}

// GET /api/sources/:domainId/referrers - Top referring websites
router.get('/:domainId/referrers', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { startDate, endDate } = getDateRange(req.query.start as string, req.query.end as string);
        const topReferrers = await sessionService.getTopReferrers(domain.id, startDate, endDate, 20);

        res.json({
            period: { start: startDate, end: endDate },
            referrers: topReferrers.map(r => ({
                domain: extractDomain(r.referrer) || r.referrer,
                sessions: r.sessions,
                visitors: r.visitors,
            }))
        });
    } catch (error) {
        log.error('Referrers error', error);
        res.status(500).json({ error: 'Failed to get referrer data' });
    }
});

// GET /api/sources/:domainId/social - Social media breakdown
router.get('/:domainId/social', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { startDate, endDate } = getDateRange(req.query.start as string, req.query.end as string);
        const sessions = await sessionService.queryByDomain(domain.id, startDate, endDate);

        // Filter to social sessions and group by platform
        const platformMap: Record<string, { visitors: Set<string | null>; sessions: number }> = {};
        for (const session of sessions) {
            const platform = identifyPlatform(session.referrer, SOCIAL_PLATFORMS);
            if (!platform) continue;
            if (!platformMap[platform]) {
                platformMap[platform] = { visitors: new Set(), sessions: 0 };
            }
            platformMap[platform].visitors.add(session.visitor_id);
            platformMap[platform].sessions++;
        }

        const platforms = Object.entries(platformMap)
            .map(([platform, data]) => ({
                platform,
                visitors: data.visitors.size,
                sessions: data.sessions,
            }))
            .sort((a, b) => b.visitors - a.visitors);

        res.json({
            period: { start: startDate, end: endDate },
            totalSocialVisitors: platforms.reduce((sum, p) => sum + p.visitors, 0),
            platforms
        });
    } catch (error) {
        log.error('Social sources error', error);
        res.status(500).json({ error: 'Failed to get social data' });
    }
});

// GET /api/sources/:domainId/search - Search engine breakdown
router.get('/:domainId/search', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { startDate, endDate } = getDateRange(req.query.start as string, req.query.end as string);
        const sessions = await sessionService.queryByDomain(domain.id, startDate, endDate);

        const engineMap: Record<string, { visitors: Set<string | null>; sessions: number }> = {};
        for (const session of sessions) {
            const engine = identifyPlatform(session.referrer, SEARCH_ENGINES);
            if (!engine) continue;
            if (!engineMap[engine]) {
                engineMap[engine] = { visitors: new Set(), sessions: 0 };
            }
            engineMap[engine].visitors.add(session.visitor_id);
            engineMap[engine].sessions++;
        }

        const engines = Object.entries(engineMap)
            .map(([engine, data]) => ({
                engine,
                visitors: data.visitors.size,
                sessions: data.sessions,
            }))
            .sort((a, b) => b.visitors - a.visitors);

        const totalOrganic = engines.reduce((sum, e) => sum + e.sessions, 0);

        res.json({
            period: { start: startDate, end: endDate },
            totalOrganicSessions: totalOrganic,
            engines: engines.map(e => ({
                ...e,
                share: totalOrganic > 0 ? Math.round((e.sessions / totalOrganic) * 100) : 0
            }))
        });
    } catch (error) {
        log.error('Search sources error', error);
        res.status(500).json({ error: 'Failed to get search data' });
    }
});

// GET /api/sources/:domainId/campaigns - UTM campaign performance
router.get('/:domainId/campaigns', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { startDate, endDate } = getDateRange(req.query.start as string, req.query.end as string);
        const events = await eventService.queryByDomain(domain.id, startDate, endDate);

        // Group by UTM campaign
        const campaignMap: Record<string, {
            source: string | null;
            medium: string | null;
            visitors: Set<string | null>;
            sessions: Set<string | null>;
            pageviews: number;
        }> = {};

        for (const event of events) {
            if (!event.utm_campaign) continue;
            const key = event.utm_campaign;
            if (!campaignMap[key]) {
                campaignMap[key] = {
                    source: event.utm_source,
                    medium: event.utm_medium,
                    visitors: new Set(),
                    sessions: new Set(),
                    pageviews: 0,
                };
            }
            campaignMap[key].visitors.add(event.visitor_id);
            campaignMap[key].sessions.add(event.session_id);
            if (event.type === 'pageview') campaignMap[key].pageviews++;
        }

        const campaigns = Object.entries(campaignMap)
            .map(([campaign, data]) => ({
                campaign,
                source: data.source,
                medium: data.medium,
                visitors: data.visitors.size,
                sessions: data.sessions.size,
                pageviews: data.pageviews,
            }))
            .sort((a, b) => b.visitors - a.visitors)
            .slice(0, 20);

        res.json({
            period: { start: startDate, end: endDate },
            totalCampaignVisitors: new Set(
                events.filter(e => e.utm_campaign).map(e => e.visitor_id)
            ).size,
            campaigns
        });
    } catch (error) {
        log.error('Campaigns error', error);
        res.status(500).json({ error: 'Failed to get campaign data' });
    }
});

// GET /api/sources/:domainId/overview - Complete sources overview
router.get('/:domainId/overview', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { startDate, endDate } = getDateRange(req.query.start as string, req.query.end as string);

        const [sourceTypes, topReferrers] = await Promise.all([
            sessionService.getSourceTypeBreakdown(domain.id, startDate, endDate),
            sessionService.getTopReferrers(domain.id, startDate, endDate, 10),
        ]);

        const breakdown: Record<string, number> = {
            direct: 0, organic: 0, paid: 0, social: 0, referral: 0, email: 0
        };
        for (const s of sourceTypes) {
            breakdown[s.source_type] = s.count;
        }
        const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

        res.json({
            period: { start: startDate, end: endDate },
            total,
            breakdown,
            percentages: Object.fromEntries(
                Object.entries(breakdown).map(([k, v]) => [k, total > 0 ? Math.round((v / total) * 100) : 0])
            ),
            topReferrers: topReferrers.map(r => ({
                domain: extractDomain(r.referrer) || r.referrer,
                sessions: r.sessions,
                visitors: r.visitors,
            }))
        });
    } catch (error) {
        log.error('Sources overview error', error);
        res.status(500).json({ error: 'Failed to get sources overview' });
    }
});

export default router;
