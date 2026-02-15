import { query } from '../db';
import { logger } from '../middleware/logger';
import crypto from 'crypto';

interface WebhookPayload {
    event: string;
    domainId: string;
    timestamp: string;
    data: any;
}

export const triggerWebhooks = async (domainId: string, event: string, data: any) => {
    try {
        // Find webhooks for this domain + event
        // We use ANY(events) to check if the event is in the array
        const webhooks = await query(
            `SELECT url, secret FROM webhooks 
             WHERE domain_id = $1 AND enabled = TRUE AND $2 = ANY(events)`,
            [domainId, event]
        );

        if (webhooks.length === 0) return;

        const payload: WebhookPayload = {
            event,
            domainId,
            timestamp: new Date().toISOString(),
            data
        };

        const promises = webhooks.map(async (webhook) => {
            try {
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TrackFlow-Webhook/1.0'
                };

                if (webhook.secret) {
                    const signature = crypto
                        .createHmac('sha256', webhook.secret)
                        .update(JSON.stringify(payload))
                        .digest('hex');
                    headers['X-TrackFlow-Signature'] = signature;
                }

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);

                try {
                    await fetch(webhook.url, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(payload),
                        signal: controller.signal
                    });
                    logger.info(`[Webhook] Sent ${event} to ${webhook.url}`);
                } finally {
                    clearTimeout(timeout);
                }
            } catch (err) {
                logger.error(`[Webhook] Failed to send to ${webhook.url}`, err);
            }
        });

        // Fire and forget (don't block the request)
        Promise.allSettled(promises);

    } catch (error) {
        logger.error('[Webhook] Error triggering webhooks', error);
    }
};
