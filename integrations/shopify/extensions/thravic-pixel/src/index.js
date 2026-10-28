// Thravic web pixel: reports cart adds, started checkouts and purchases, which
// the storefront tracker cannot see (checkout pages do not run theme code).
// https://shopify.dev/docs/apps/build/marketing-analytics/build-web-pixels
import { register } from '@shopify/web-pixels-extension';
import {
    EVENT_NAMES, buildPayload, normalizeTrackingId, resolveIds, send,
} from './events.js';

register(({ analytics, browser, settings }) => {
    const trackingId = normalizeTrackingId(settings.trackingId);
    if (!trackingId) return;

    for (const name of Object.keys(EVENT_NAMES)) {
        analytics.subscribe(name, async (event) => {
            const ids = await resolveIds(browser);
            await send(trackingId, buildPayload(name, event, ids));
        });
    }
});
