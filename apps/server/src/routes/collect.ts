import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const router = Router();

// In-memory event storage (replace with time-series DB or PostgreSQL in production)
interface Event {
    id: string;
    trackingId: string;
    type: 'pageview' | 'click' | 'scroll' | 'form' | 'custom';
    timestamp: Date;
    visitorId: string;
    sessionId: string;
    url: string;
    referrer: string | null;

    // UTM Parameters
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmTerm: string | null;
    utmContent: string | null;

    // Device Info
    userAgent: string;
    screenWidth: number | null;
    screenHeight: number | null;
    language: string | null;

    // Event-specific data
    data: Record<string, unknown>;
}

interface Session {
    id: string;
    visitorId: string;
    trackingId: string;
    startedAt: Date;
    lastActivity: Date;
    pageviews: number;
    source: string | null;
    sourceType: 'direct' | 'organic' | 'paid' | 'social' | 'referral' | 'email';
}

const events: Event[] = [];
const sessions: Map<string, Session> = new Map();
const visitors: Set<string> = new Set();

// Event validation schema
const eventSchema = z.object({
    type: z.enum(['pageview', 'click', 'scroll', 'form', 'custom']),
    url: z.string().url(),
    referrer: z.string().nullable().optional(),
    visitorId: z.string(),
    sessionId: z.string(),

    // UTM
    utmSource: z.string().nullable().optional(),
    utmMedium: z.string().nullable().optional(),
    utmCampaign: z.string().nullable().optional(),
    utmTerm: z.string().nullable().optional(),
    utmContent: z.string().nullable().optional(),

    // Device
    screenWidth: z.number().nullable().optional(),
    screenHeight: z.number().nullable().optional(),
    language: z.string().nullable().optional(),

    // Event data
    data: z.record(z.unknown()).optional()
});

const batchEventSchema = z.object({
    trackingId: z.string(),
    events: z.array(eventSchema)
});

// Determine source type from referrer or UTM
function getSourceType(referrer: string | null, utmMedium: string | null): Session['sourceType'] {
    if (utmMedium) {
        const medium = utmMedium.toLowerCase();
        if (medium === 'cpc' || medium === 'ppc' || medium === 'paid') return 'paid';
        if (medium === 'email') return 'email';
        if (medium === 'social') return 'social';
        if (medium === 'organic') return 'organic';
        if (medium === 'referral') return 'referral';
    }

    if (!referrer) return 'direct';

    const ref = referrer.toLowerCase();

    // Social platforms
    if (ref.includes('facebook') || ref.includes('twitter') ||
        ref.includes('linkedin') || ref.includes('instagram') ||
        ref.includes('tiktok') || ref.includes('youtube')) {
        return 'social';
    }

    // Search engines
    if (ref.includes('google') || ref.includes('bing') ||
        ref.includes('yahoo') || ref.includes('duckduckgo')) {
        return 'organic';
    }

    return 'referral';
}

// Extract domain from referrer
function getSourceDomain(referrer: string | null): string | null {
    if (!referrer) return null;
    try {
        return new URL(referrer).hostname;
    } catch {
        return null;
    }
}

// POST /api/collect - Batch event collection
router.post('/', async (req: Request, res: Response) => {
    try {
        const { trackingId, events: eventBatch } = batchEventSchema.parse(req.body);
        const userAgent = req.headers['user-agent'] || '';

        const processedEvents: string[] = [];

        for (const event of eventBatch) {
            const eventId = uuidv4();

            // Update or create session
            let session = sessions.get(event.sessionId);
            if (!session) {
                session = {
                    id: event.sessionId,
                    visitorId: event.visitorId,
                    trackingId,
                    startedAt: new Date(),
                    lastActivity: new Date(),
                    pageviews: 0,
                    source: getSourceDomain(event.referrer || null) || event.utmSource || null,
                    sourceType: getSourceType(event.referrer || null, event.utmMedium || null)
                };
                sessions.set(event.sessionId, session);
            }

            // Update session
            session.lastActivity = new Date();
            if (event.type === 'pageview') {
                session.pageviews++;
            }

            // Track unique visitors
            visitors.add(event.visitorId);

            // Store event
            const storedEvent: Event = {
                id: eventId,
                trackingId,
                type: event.type,
                timestamp: new Date(),
                visitorId: event.visitorId,
                sessionId: event.sessionId,
                url: event.url,
                referrer: event.referrer || null,
                utmSource: event.utmSource || null,
                utmMedium: event.utmMedium || null,
                utmCampaign: event.utmCampaign || null,
                utmTerm: event.utmTerm || null,
                utmContent: event.utmContent || null,
                userAgent,
                screenWidth: event.screenWidth || null,
                screenHeight: event.screenHeight || null,
                language: event.language || null,
                data: event.data || {}
            };

            events.push(storedEvent);
            processedEvents.push(eventId);
        }

        res.status(202).json({
            success: true,
            processed: processedEvents.length
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid event data' });
        }
        console.error('Event collection error:', error);
        res.status(500).json({ error: 'Failed to process events' });
    }
});

// POST /api/collect/beacon - SendBeacon endpoint (smaller response)
router.post('/beacon', (req: Request, res: Response) => {
    // Same as above but optimized for sendBeacon
    // SendBeacon doesn't wait for response, so this is mostly for logging
    try {
        const { trackingId, events: eventBatch } = batchEventSchema.parse(req.body);
        const userAgent = req.headers['user-agent'] || '';

        for (const event of eventBatch) {
            const eventId = uuidv4();

            let session = sessions.get(event.sessionId);
            if (!session) {
                session = {
                    id: event.sessionId,
                    visitorId: event.visitorId,
                    trackingId,
                    startedAt: new Date(),
                    lastActivity: new Date(),
                    pageviews: 0,
                    source: getSourceDomain(event.referrer || null) || event.utmSource || null,
                    sourceType: getSourceType(event.referrer || null, event.utmMedium || null)
                };
                sessions.set(event.sessionId, session);
            }

            session.lastActivity = new Date();
            if (event.type === 'pageview') session.pageviews++;
            visitors.add(event.visitorId);

            events.push({
                id: eventId,
                trackingId,
                type: event.type,
                timestamp: new Date(),
                visitorId: event.visitorId,
                sessionId: event.sessionId,
                url: event.url,
                referrer: event.referrer || null,
                utmSource: event.utmSource || null,
                utmMedium: event.utmMedium || null,
                utmCampaign: event.utmCampaign || null,
                utmTerm: event.utmTerm || null,
                utmContent: event.utmContent || null,
                userAgent,
                screenWidth: event.screenWidth || null,
                screenHeight: event.screenHeight || null,
                language: event.language || null,
                data: event.data || {}
            });
        }

        res.status(204).send();
    } catch (error) {
        res.status(204).send(); // Always return 204 for beacon
    }
});

// Export for analytics routes
export { events, sessions, visitors };
export default router;
