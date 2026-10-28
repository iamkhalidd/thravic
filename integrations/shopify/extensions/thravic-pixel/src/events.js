// What the Thravic web pixel sends, kept apart from `register()` so it can be
// tested with plain Node (see ../../../tests/pixel.test.mjs).
//
// Each Shopify event becomes one Thravic custom event, posted to the same
// collector the website tracker uses: POST /api/collect/{trackingId}, in the
// shape apps/api/app/routers/collect.py accepts.

export const COLLECT_URL = 'https://api.thravic.com/api/collect';

// "TF-" and 8 hex characters, as apps/api/app/routers/domains.py makes them.
export const TRACKING_ID_PATTERN = /^TF-[0-9A-F]{8}$/;

// Shopify standard event -> Thravic custom event name.
export const EVENT_NAMES = {
    checkout_started: 'checkout_started',
    checkout_completed: 'purchase',
    product_added_to_cart: 'add_to_cart',
};

// The website tracker's storage keys and session length
// (apps/api/tracker/src/index.ts), so both report the same visitor and visit.
export const VISITOR_KEY = '_tf_vid';
export const SESSION_KEY = '_tf_sid';
export const SESSION_EXPIRY = 30 * 60 * 1000;

const MAX_ID = 100;
const MAX_TEXT = 200;

export function normalizeTrackingId(raw) {
    const id = String(raw ?? '').trim().toUpperCase();
    return TRACKING_ID_PATTERN.test(id) ? id : null;
}

function amount(money) {
    const value = Number(money?.amount);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

function text(value) {
    return typeof value === 'string' && value ? value.slice(0, MAX_TEXT) : null;
}

/** Drop empty fields, so the stored event only has what Shopify knew. */
function compact(object) {
    return Object.fromEntries(
        Object.entries(object).filter(([, value]) => value !== null && value !== undefined),
    );
}

/** The `data` of the Thravic event for one Shopify event. */
export function eventData(name, event) {
    const thravicName = EVENT_NAMES[name];
    if (name === 'product_added_to_cart') {
        const line = event?.data?.cartLine;
        return compact({
            event: thravicName,
            value: amount(line?.cost?.totalAmount),
            currency: line?.cost?.totalAmount?.currencyCode ?? line?.merchandise?.price?.currencyCode,
            items: Number.isFinite(line?.quantity) ? line.quantity : null,
            product: text(line?.merchandise?.product?.title),
            productId: text(line?.merchandise?.product?.id),
            variantId: text(line?.merchandise?.id),
        });
    }

    const checkout = event?.data?.checkout;
    const items = (checkout?.lineItems ?? []).reduce(
        (sum, line) => sum + (Number.isFinite(line?.quantity) ? line.quantity : 0),
        0,
    );
    return compact({
        event: thravicName,
        value: amount(checkout?.totalPrice),
        currency: checkout?.totalPrice?.currencyCode ?? checkout?.currencyCode,
        items: checkout?.lineItems ? items : null,
        // Only a completed checkout has an order. It is what stops a purchase
        // being counted twice when the thank-you page is reloaded.
        orderId: name === 'checkout_completed' ? text(checkout?.order?.id) : null,
    });
}

function utm(href) {
    try {
        const params = new URL(href).searchParams;
        return {
            utmSource: params.get('utm_source'),
            utmMedium: params.get('utm_medium'),
            utmCampaign: params.get('utm_campaign'),
            utmTerm: params.get('utm_term'),
            utmContent: params.get('utm_content'),
        };
    } catch {
        return {};
    }
}

/** The full collector payload for one Shopify event. */
export function buildPayload(name, event, ids) {
    const context = event?.context ?? {};
    const href = context.document?.location?.href ?? '';
    return {
        // Shopify's event id: a re-delivered event is stored once.
        eventId: `shopify-${event?.id ?? ids.fallbackEventId}`.slice(0, MAX_ID),
        type: 'custom',
        url: href,
        referrer: context.document?.referrer || null,
        visitorId: ids.visitorId,
        sessionId: ids.sessionId,
        ...utm(href),
        screenWidth: context.window?.screen?.width ?? null,
        screenHeight: context.window?.screen?.height ?? null,
        language: context.navigator?.language ?? null,
        data: eventData(name, event),
    };
}

export function newId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

/** The tracker's `{id, expiry}` session, if it is still live. */
export function liveSession(raw, now) {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.id === 'string' && parsed.id && Number(parsed.expiry) > now) {
            return parsed.id;
        }
    } catch { /* missing or not ours */ }
    return null;
}

async function attempt(read) {
    try {
        const value = await read();
        return typeof value === 'string' && value ? decodeURIComponent(value) : null;
    } catch {
        return null;
    }
}

/**
 * The visitor and session ids: the storefront tracker's cookies first (it sets
 * them on Shopify stores, and they reach checkout), then its storage, else new
 * ones saved in the tracker's own format so the tracker picks them up later.
 * `browser` is the pixel's sandbox API: https://shopify.dev/docs/api/web-pixels-api/standard-api/browser
 */
export async function resolveIds(browser, now = Date.now(), makeId = newId) {
    const visitorId = (await attempt(() => browser.cookie.get(VISITOR_KEY)))
        || (await attempt(() => browser.localStorage.getItem(VISITOR_KEY)))
        || makeId();
    const sessionId = (await attempt(() => browser.cookie.get(SESSION_KEY)))
        || liveSession(await attempt(() => browser.sessionStorage.getItem(SESSION_KEY)), now)
        || makeId();

    try {
        if (!(await attempt(() => browser.localStorage.getItem(VISITOR_KEY)))) {
            await browser.localStorage.setItem(VISITOR_KEY, visitorId);
        }
        await browser.sessionStorage.setItem(
            SESSION_KEY,
            JSON.stringify({ id: sessionId, expiry: now + SESSION_EXPIRY }),
        );
    } catch { /* storage blocked: the ids still go out with this event */ }

    return { visitorId, sessionId, fallbackEventId: makeId() };
}

/**
 * Post one event. text/plain needs no CORS preflight, and the collector reads
 * the body as JSON whatever its type. `keepalive` lets it finish as the
 * thank-you page or cart drawer changes.
 */
export function send(trackingId, payload, fetchImpl = fetch) {
    return fetchImpl(`${COLLECT_URL}/${trackingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
        keepalive: true,
    }).catch(() => undefined);
}
