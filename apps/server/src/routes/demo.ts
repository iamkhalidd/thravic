import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import * as userService from '../services/userService';
import * as domainService from '../services/domainService';
import * as eventService from '../services/eventService';
import * as sessionService from '../services/sessionService';
import { createLogger } from '../config/logger';

const log = createLogger('Demo');

const router = Router();

// ── Guard: only expose demo routes when DEMO_MODE is explicitly enabled ──
if (process.env.DEMO_MODE !== 'true') {
    router.all('*', (_req, res: Response) =>
        res.status(404).json({ error: 'Not found' })
    );
}

// Demo user credentials
const DEMO_EMAIL = 'demo@thravic.io';
const DEMO_PASSWORD = 'demo1234';
const DEMO_NAME = 'Demo User';

let demoSeeded = false;
let demoUserId: string | null = null;

// Social referrers for realistic data
const socialReferrers = [
    'https://twitter.com/thravic',
    'https://linkedin.com/company/thravic',
    'https://facebook.com/thravic',
    'https://reddit.com/r/analytics',
    'https://youtube.com/watch?v=demo'
];

const searchReferrers = [
    'https://google.com/search?q=analytics+tool',
    'https://bing.com/search?q=website+tracking',
    'https://duckduckgo.com/?q=privacy+analytics'
];

const regularReferrers = [
    'https://producthunt.com/posts/thravic',
    'https://hackernews.com/item?id=123456',
    'https://medium.com/analytics-trends',
    'https://techcrunch.com/startups',
    'https://dev.to/thravic'
];

const utmCampaigns = [
    { source: 'twitter', medium: 'social', campaign: 'launch2024' },
    { source: 'google', medium: 'cpc', campaign: 'brand-awareness' },
    { source: 'newsletter', medium: 'email', campaign: 'weekly-digest' },
    { source: 'linkedin', medium: 'social', campaign: 'b2b-outreach' },
    { source: 'facebook', medium: 'paid', campaign: 'retargeting' }
];

const pages = [
    '/', '/pricing', '/features', '/about', '/blog', '/docs',
    '/blog/analytics-guide', '/docs/getting-started', '/signup', '/login'
];

function randomDate(daysBack: number): Date {
    const now = Date.now();
    const past = now - daysBack * 24 * 60 * 60 * 1000;
    return new Date(past + Math.random() * (now - past));
}

function classifySource(referrer: string | null, utmMedium: string | null): string {
    if (utmMedium === 'cpc' || utmMedium === 'paid') return 'paid';
    if (utmMedium === 'email') return 'email';
    if (!referrer) return 'direct';
    const socialDomains = ['facebook.com', 'twitter.com', 'linkedin.com', 'reddit.com', 'youtube.com'];
    const searchDomains = ['google.com', 'bing.com', 'duckduckgo.com'];
    try {
        const host = new URL(referrer).hostname.replace('www.', '');
        if (socialDomains.some(d => host.includes(d))) return 'social';
        if (searchDomains.some(d => host.includes(d))) return 'organic';
    } catch { /* ignore */ }
    return 'referral';
}

/**
 * Generate demo data directly into PostgreSQL via services.
 */
async function generateDemoData(domainId: string) {
    const visitorCount = 150;

    for (let v = 0; v < visitorCount; v++) {
        const visitorId = `demo-v-${uuidv4().slice(0, 8)}`;
        const numSessions = Math.random() > 0.7 ? 2 : 1;

        for (let s = 0; s < numSessions; s++) {
            const sessionId = `demo-s-${uuidv4().slice(0, 8)}`;
            const sessionDate = randomDate(14);

            // Determine source
            const sourceRoll = Math.random();
            let referrer: string | null = null;
            let utmData: typeof utmCampaigns[0] | null = null;

            if (sourceRoll < 0.25) {
                // direct
            } else if (sourceRoll < 0.45) {
                referrer = searchReferrers[Math.floor(Math.random() * searchReferrers.length)];
            } else if (sourceRoll < 0.60) {
                referrer = socialReferrers[Math.floor(Math.random() * socialReferrers.length)];
            } else if (sourceRoll < 0.75) {
                referrer = regularReferrers[Math.floor(Math.random() * regularReferrers.length)];
            } else if (sourceRoll < 0.90) {
                utmData = utmCampaigns[Math.floor(Math.random() * utmCampaigns.length)];
            } else {
                utmData = { source: 'newsletter', medium: 'email', campaign: 'weekly-digest' };
            }

            const sourceType = classifySource(referrer, utmData?.medium || null);

            // Upsert session
            await sessionService.upsert({
                sessionId,
                domainId,
                visitorId,
                source: referrer ? new URL(referrer).hostname : utmData?.source || null,
                sourceType,
                referrer,
                utmSource: utmData?.source || null,
                utmMedium: utmData?.medium || null,
                utmCampaign: utmData?.campaign || null,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                screenWidth: [1920, 1440, 1366, 1280][Math.floor(Math.random() * 4)],
                screenHeight: [1080, 900, 768, 720][Math.floor(Math.random() * 4)],
                language: 'en-US',
            });

            // Create events
            const pageviewCount = Math.floor(Math.random() * 5) + 1;
            const eventBatch: eventService.InsertEventParams[] = [];

            for (let p = 0; p < pageviewCount; p++) {
                const page = pages[Math.floor(Math.random() * pages.length)];
                eventBatch.push({
                    domainId,
                    sessionId,
                    visitorId,
                    type: 'pageview',
                    url: `https://example.com${page}`,
                    referrer,
                    utmSource: utmData?.source || null,
                    utmMedium: utmData?.medium || null,
                    utmCampaign: utmData?.campaign || null,
                    data: {},
                });
            }

            // Some click events
            if (Math.random() > 0.5) {
                eventBatch.push({
                    domainId,
                    sessionId,
                    visitorId,
                    type: 'click',
                    url: `https://example.com${pages[Math.floor(Math.random() * pages.length)]}`,
                    referrer,
                    utmSource: utmData?.source || null,
                    utmMedium: utmData?.medium || null,
                    utmCampaign: utmData?.campaign || null,
                    data: { element: 'button.cta', x: 500, y: 300 },
                });
            }

            await eventService.batchInsert(eventBatch);
        }
    }
}

// POST /api/demo/seed - Create demo account and data
router.post('/seed', async (req, res: Response) => {
    try {
        if (demoSeeded) {
            return res.json({
                message: 'Demo already seeded',
                credentials: { email: DEMO_EMAIL, password: DEMO_PASSWORD }
            });
        }

        // Create demo user in database
        const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 12);
        const user = await userService.createUser(DEMO_EMAIL, hashedPassword, DEMO_NAME);
        await userService.updateSubscription(user.id, 'pro');
        demoUserId = user.id;

        // Create demo domain in database
        const trackingId = `tf_demo_${uuidv4().slice(0, 8)}`;
        const domain = await domainService.create(user.id, 'example.com', 'Demo Website', trackingId);
        await domainService.verify(domain.id);

        // Generate sample analytics data into PostgreSQL
        await generateDemoData(domain.id);

        demoSeeded = true;

        res.json({
            success: true,
            message: 'Demo data seeded successfully!',
            credentials: { email: DEMO_EMAIL, password: DEMO_PASSWORD }
        });
    } catch (error) {
        log.error('Demo seed error', error);
        res.status(500).json({ error: 'Failed to seed demo data' });
    }
});

// GET /api/demo/credentials - Get demo login info
router.get('/credentials', (req, res: Response) => {
    res.json({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        note: 'Use these credentials to log in and explore the dashboard'
    });
});

export { demoUserId, DEMO_EMAIL, DEMO_PASSWORD };
export default router;
