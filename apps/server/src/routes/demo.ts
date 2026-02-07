import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { events, sessions, visitors } from './collect';
import { domains } from './domains';
import { users } from './auth';

const router = Router();

// Demo user credentials
const DEMO_EMAIL = 'demo@trackflow.io';
const DEMO_PASSWORD = 'demo1234';
const DEMO_NAME = 'Demo User';

// Track if demo is already seeded
let demoSeeded = false;
let demoUserId: string | null = null;

// Social referrers for realistic data
const socialReferrers = [
    'https://twitter.com/trackflow',
    'https://linkedin.com/company/trackflow',
    'https://facebook.com/trackflow',
    'https://reddit.com/r/analytics',
    'https://youtube.com/watch?v=demo'
];

const searchReferrers = [
    'https://google.com/search?q=analytics+tool',
    'https://bing.com/search?q=website+tracking',
    'https://duckduckgo.com/?q=privacy+analytics'
];

const regularReferrers = [
    'https://producthunt.com/posts/trackflow',
    'https://hackernews.com/item?id=123456',
    'https://medium.com/analytics-trends',
    'https://techcrunch.com/startups',
    'https://dev.to/trackflow'
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

// Generate random date within last N days
function randomDate(daysBack: number): Date {
    const now = Date.now();
    const past = now - daysBack * 24 * 60 * 60 * 1000;
    return new Date(past + Math.random() * (now - past));
}

// Generate sample data for demo
function generateDemoData(trackingId: string) {
    const visitorCount = 150;
    const sessionMultiplier = 1.3; // Some visitors have multiple sessions

    for (let v = 0; v < visitorCount; v++) {
        const visitorId = `demo-v-${uuidv4().slice(0, 8)}`;
        const numSessions = Math.random() > 0.7 ? 2 : 1;

        visitors.add(visitorId);

        for (let s = 0; s < numSessions; s++) {
            const sessionId = `demo-s-${uuidv4().slice(0, 8)}`;
            const sessionDate = randomDate(14);

            // Determine source type
            const sourceRoll = Math.random();
            let referrer: string | null = null;
            let utmData: typeof utmCampaigns[0] | null = null;
            let sourceType: 'direct' | 'organic' | 'paid' | 'social' | 'referral' | 'email' = 'direct';

            if (sourceRoll < 0.25) {
                // Direct traffic
                sourceType = 'direct';
            } else if (sourceRoll < 0.45) {
                // Organic search
                referrer = searchReferrers[Math.floor(Math.random() * searchReferrers.length)];
                sourceType = 'organic';
            } else if (sourceRoll < 0.60) {
                // Social
                referrer = socialReferrers[Math.floor(Math.random() * socialReferrers.length)];
                sourceType = 'social';
            } else if (sourceRoll < 0.75) {
                // Referral
                referrer = regularReferrers[Math.floor(Math.random() * regularReferrers.length)];
                sourceType = 'referral';
            } else if (sourceRoll < 0.90) {
                // UTM Campaign
                utmData = utmCampaigns[Math.floor(Math.random() * utmCampaigns.length)];
                sourceType = utmData.medium === 'email' ? 'email' : utmData.medium === 'cpc' || utmData.medium === 'paid' ? 'paid' : 'social';
            } else {
                // Email
                utmData = { source: 'newsletter', medium: 'email', campaign: 'weekly-digest' };
                sourceType = 'email';
            }

            // Create session
            const pageviewCount = Math.floor(Math.random() * 5) + 1;
            sessions.set(sessionId, {
                id: sessionId,
                visitorId,
                trackingId,
                startedAt: sessionDate,
                lastActivity: new Date(sessionDate.getTime() + pageviewCount * 60000),
                pageviews: pageviewCount,
                source: referrer ? new URL(referrer).hostname : utmData?.source || null,
                sourceType
            });

            // Create pageview events
            for (let p = 0; p < pageviewCount; p++) {
                const page = pages[Math.floor(Math.random() * pages.length)];
                const eventTime = new Date(sessionDate.getTime() + p * 30000 + Math.random() * 30000);

                events.push({
                    id: `demo-e-${uuidv4().slice(0, 8)}`,
                    trackingId,
                    type: 'pageview',
                    timestamp: eventTime,
                    visitorId,
                    sessionId,
                    url: `https://example.com${page}`,
                    referrer,
                    utmSource: utmData?.source || null,
                    utmMedium: utmData?.medium || null,
                    utmCampaign: utmData?.campaign || null,
                    utmTerm: null,
                    utmContent: null,
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    screenWidth: [1920, 1440, 1366, 1280][Math.floor(Math.random() * 4)],
                    screenHeight: [1080, 900, 768, 720][Math.floor(Math.random() * 4)],
                    language: 'en-US',
                    data: {}
                });
            }

            // Add some click events
            if (Math.random() > 0.5) {
                events.push({
                    id: `demo-e-${uuidv4().slice(0, 8)}`,
                    trackingId,
                    type: 'click',
                    timestamp: new Date(sessionDate.getTime() + 45000),
                    visitorId,
                    sessionId,
                    url: `https://example.com${pages[Math.floor(Math.random() * pages.length)]}`,
                    referrer,
                    utmSource: utmData?.source || null,
                    utmMedium: utmData?.medium || null,
                    utmCampaign: utmData?.campaign || null,
                    utmTerm: null,
                    utmContent: null,
                    userAgent: 'Mozilla/5.0',
                    screenWidth: 1920,
                    screenHeight: 1080,
                    language: 'en-US',
                    data: { element: 'button.cta', x: 500, y: 300 }
                });
            }
        }
    }
}

// POST /api/demo/seed - Create demo account and data
router.post('/seed', async (req, res: Response) => {
    try {
        if (demoSeeded) {
            return res.json({
                message: 'Demo already seeded',
                credentials: {
                    email: DEMO_EMAIL,
                    password: DEMO_PASSWORD
                }
            });
        }

        // Create demo user
        const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 12);
        demoUserId = uuidv4();

        const demoUser = {
            id: demoUserId,
            email: DEMO_EMAIL,
            password: hashedPassword,
            name: DEMO_NAME,
            createdAt: new Date(),
            subscription: 'pro' as const
        };

        // Add demo user to users map
        users.set(demoUserId, demoUser);

        // Create demo domain
        const domainId = uuidv4();
        const trackingId = `tf_demo_${uuidv4().slice(0, 8)}`;

        domains.set(domainId, {
            id: domainId,
            userId: demoUserId,
            domain: 'example.com',
            name: 'Demo Website',
            trackingId,
            verified: true,
            createdAt: new Date(),
            settings: {
                trackClicks: true,
                trackScrolls: true,
                trackForms: true,
                sessionRecording: true,
                heatmaps: true
            }
        });

        // Generate sample analytics data
        generateDemoData(trackingId);

        demoSeeded = true;

        res.json({
            success: true,
            message: 'Demo data seeded successfully!',
            credentials: {
                email: DEMO_EMAIL,
                password: DEMO_PASSWORD
            },
            stats: {
                visitors: visitors.size,
                sessions: sessions.size,
                events: events.length
            }
        });
    } catch (error) {
        console.error('Demo seed error:', error);
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

// Export demo user ID for auth validation
export { demoUserId, DEMO_EMAIL, DEMO_PASSWORD };
export default router;
