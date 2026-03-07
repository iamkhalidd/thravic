import redisClient from '../db/redis';
import * as sessionService from '../services/sessionService';
import * as eventService from '../services/eventService';
import { createLogger } from '../config/logger';

const log = createLogger('EventWorker');

const QUEUE_KEY = 'thravic:events_queue';
const BATCH_SIZE = 50;
const WAIT_TIME = 1000; // 1s wait between batches if empty

let isProcessing = false;
let isShuttingDown = false;

async function processBatch() {
    if (isShuttingDown) return;
    
    try {
        // Pop up to BATCH_SIZE elements
        const events: any[] = [];
        for (let i = 0; i < BATCH_SIZE; i++) {
            const raw = await redisClient.rpop(QUEUE_KEY);
            if (!raw) break;
            events.push(JSON.parse(raw));
        }

        if (events.length === 0) {
            // Queue empty, wait and try again
            setTimeout(processBatch, WAIT_TIME);
            return;
        }

        log.info(`Processing batch of ${events.length} events...`);

        // Insert sessions (using Promise.all for now; ideally we'd bulk upsert sessions too)
        const sessionUpserts = events.map(e => sessionService.upsert({
            sessionId: e.sessionId,
            domainId: e.domainId,
            visitorId: e.visitorId,
            source: e.source,
            sourceType: e.sourceType,
            referrer: e.referrer,
            utmSource: e.utmSource,
            utmMedium: e.utmMedium,
            utmCampaign: e.utmCampaign,
            utmTerm: e.utmTerm,
            utmContent: e.utmContent,
            userAgent: e.userAgent,
            screenWidth: e.screenWidth,
            screenHeight: e.screenHeight,
            language: e.language,
            country: e.country,
            region: e.region,
            city: e.city,
        }));
        await Promise.allSettled(sessionUpserts);

        // Bulk insert events using the transactional batch insert
        const insertedCount = await eventService.batchInsert(events.map(e => ({
            domainId: e.domainId,
            sessionId: e.sessionId,
            visitorId: e.visitorId,
            type: e.type,
            url: e.url,
            referrer: e.referrer,
            utmSource: e.utmSource,
            utmMedium: e.utmMedium,
            utmCampaign: e.utmCampaign,
            data: e.data
        })));
        
        log.info(`Successfully stored ${insertedCount} events into Postgres.`);

        // Immediately check for more if we processed a full batch
        if (events.length === BATCH_SIZE) {
            setImmediate(processBatch);
        } else {
            setTimeout(processBatch, WAIT_TIME);
        }

    } catch (error) {
        log.error('Failed to process event batch', error);
        // On crash, wait then resume
        setTimeout(processBatch, WAIT_TIME * 5);
    }
}

export function startEventWorker() {
    if (isProcessing) return;
    isProcessing = true;
    log.info('Started background event processing worker');
    processBatch();
}

export function stopEventWorker() {
    log.info('Shutting down event worker gracefully...');
    isShuttingDown = true;
}
