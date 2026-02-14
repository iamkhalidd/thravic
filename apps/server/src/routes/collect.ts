import { checkIp } from '../services/geoService';
import * as eventService from '../services/eventService';
import * as sessionService from '../services/sessionService';
import { classifySource } from '../services/sessionService';

import { eventSchema, batchSchema } from '../validators/collect';
import { triggerWebhooks } from '../services/webhookService';

// ...

// ── POST /api/collect/:trackingId ───────────
router.post('/:trackingId', async (req: Request, res: Response) => {
    try {
        const { trackingId } = req.params;

        // Validate tracking ID exists
        const domain = await domainService.getByTrackingId(trackingId);
        if (!domain) {
            return res.status(404).json({ error: 'Invalid tracking ID' });
        }

        const event = eventSchema.parse(req.body);
        const userAgent = req.headers['user-agent'] || '';

        // Get IP for Geo
        const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
        const location = checkIp(ip.split(',')[0].trim());

        // Classify traffic source
        const sourceType = classifySource(
            event.referrer || null,
            event.utmSource || null,
            event.utmMedium || null
        );

        // Upsert session
        await sessionService.upsert({
            sessionId: event.sessionId,
            domainId: domain.id,
            visitorId: event.visitorId,
            source: event.utmSource || event.referrer || null,
            sourceType,
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
            country: location?.country || null,
            region: location?.region || null,
            city: location?.city || null,
        });

        // Insert event
        await eventService.insertEvent({
            domainId: domain.id,
            sessionId: event.sessionId,
            visitorId: event.visitorId,
            type: event.type,
            url: event.url,
            referrer: event.referrer || null,
            utmSource: event.utmSource || null,
            utmMedium: event.utmMedium || null,
            utmCampaign: event.utmCampaign || null,
            data: event.data || {},
        });

        // Trigger Webhooks (async)
        triggerWebhooks(domain.id, event.type, {
            ...event,
            location,
            sourceType
        });

        res.status(202).json({ success: true });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid event data', details: error.errors });
        }
        console.error('Collect error:', error);
        res.status(500).json({ error: 'Failed to process event' });
    }
});


// ── POST /api/collect/:trackingId/batch ─────
router.post('/:trackingId/batch', async (req: Request, res: Response) => {
    try {
        const { trackingId } = req.params;

        const domain = await domainService.getByTrackingId(trackingId);
        if (!domain) {
            return res.status(404).json({ error: 'Invalid tracking ID' });
        }

        const { events } = batchSchema.parse(req.body);
        const userAgent = req.headers['user-agent'] || '';

        // Process each event
        const inserts: eventService.InsertEventParams[] = [];

        for (const event of events) {
            const sourceType = classifySource(
                event.referrer || null,
                event.utmSource || null,
                event.utmMedium || null
            );

            // Upsert session
            await sessionService.upsert({
                sessionId: event.sessionId,
                domainId: domain.id,
                visitorId: event.visitorId,
                source: event.utmSource || event.referrer || null,
                sourceType,
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
            });

            inserts.push({
                domainId: domain.id,
                sessionId: event.sessionId,
                visitorId: event.visitorId,
                type: event.type,
                url: event.url,
                referrer: event.referrer || null,
                utmSource: event.utmSource || null,
                utmMedium: event.utmMedium || null,
                utmCampaign: event.utmCampaign || null,
                data: event.data || {},
            });
        }

        // Batch insert all events
        const count = await eventService.batchInsert(inserts);

        res.status(202).json({
            success: true,
            processed: count
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid batch data', details: error.errors });
        }
        console.error('Batch collect error:', error);
        res.status(500).json({ error: 'Failed to process events' });
    }
});

// ── GET /api/collect/realtime/:trackingId ───
router.get('/realtime/:trackingId', async (req: Request, res: Response) => {
    try {
        const domain = await domainService.getByTrackingId(req.params.trackingId);
        if (!domain) {
            return res.status(404).json({ error: 'Invalid tracking ID' });
        }

        const activeVisitors = await eventService.countRealtimeVisitors(domain.id, 5);

        res.json({
            activeVisitors,
            trackingId: req.params.trackingId
        });
    } catch (error) {
        console.error('Realtime error:', error);
        res.status(500).json({ error: 'Failed to get realtime data' });
    }
});

export default router;
