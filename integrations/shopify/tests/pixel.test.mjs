// Run with `npm test` (Node 18+): checks what the web pixel sends, without Shopify.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    COLLECT_URL, SESSION_EXPIRY, buildPayload, eventData, liveSession,
    normalizeTrackingId, resolveIds, send,
} from '../extensions/thravic-pixel/src/events.js';

const context = {
    document: {
        location: { href: 'https://shop.example/checkouts/cn/abc/thank-you?utm_source=ig' },
        referrer: 'https://shop.example/cart',
    },
    window: { screen: { width: 390, height: 844 } },
    navigator: { language: 'en-NG' },
};

const checkoutCompleted = {
    id: 'sh-123',
    context,
    data: {
        checkout: {
            currencyCode: 'NGN',
            totalPrice: { amount: 15000.5, currencyCode: 'NGN' },
            lineItems: [{ quantity: 2 }, { quantity: 1 }],
            order: { id: '5551234' },
        },
    },
};

const addedToCart = {
    id: 'sh-456',
    context,
    data: {
        cartLine: {
            quantity: 3,
            cost: { totalAmount: { amount: 30, currencyCode: 'USD' } },
            merchandise: { id: 'v1', price: { amount: 10, currencyCode: 'USD' }, product: { id: 'p1', title: 'Ankara tote' } },
        },
    },
};

/** A stand-in for the pixel's `browser` sandbox API. */
function fakeBrowser({ cookies = {}, local = {}, session = {} } = {}) {
    const store = (values) => ({
        values,
        getItem: async (key) => values[key] ?? null,
        setItem: async (key, value) => { values[key] = value; },
    });
    return {
        cookie: { get: async (name) => cookies[name] ?? '' },
        localStorage: store(local),
        sessionStorage: store(session),
    };
}

test('tracking ids are checked and tidied', () => {
    assert.equal(normalizeTrackingId(' tf-1a2b3c4d '), 'TF-1A2B3C4D');
    assert.equal(normalizeTrackingId('TF-1A2B3C4'), null);
    assert.equal(normalizeTrackingId('TF-1A2B3C4G'), null);
    assert.equal(normalizeTrackingId(undefined), null);
});

test('a completed checkout becomes a purchase with value, currency, items and order', () => {
    assert.deepEqual(eventData('checkout_completed', checkoutCompleted), {
        event: 'purchase', value: 15000.5, currency: 'NGN', items: 3, orderId: '5551234',
    });
});

test('a started checkout has no order id', () => {
    const data = eventData('checkout_started', checkoutCompleted);
    assert.equal(data.event, 'checkout_started');
    assert.equal(data.orderId, undefined);
    assert.equal(data.value, 15000.5);
});

test('a cart add becomes add_to_cart with the line total', () => {
    assert.deepEqual(eventData('product_added_to_cart', addedToCart), {
        event: 'add_to_cart', value: 30, currency: 'USD', items: 3,
        product: 'Ankara tote', productId: 'p1', variantId: 'v1',
    });
});

test('missing fields are left out rather than sent as null', () => {
    assert.deepEqual(eventData('checkout_completed', { data: { checkout: {} } }), { event: 'purchase' });
});

test('the payload has the shape the collector accepts', () => {
    const payload = buildPayload('checkout_completed', checkoutCompleted, {
        visitorId: 'v-1', sessionId: 's-1', fallbackEventId: 'x',
    });
    assert.equal(payload.type, 'custom');
    assert.equal(payload.eventId, 'shopify-sh-123');
    assert.equal(payload.url, context.document.location.href);
    assert.equal(payload.referrer, 'https://shop.example/cart');
    assert.equal(payload.visitorId, 'v-1');
    assert.equal(payload.sessionId, 's-1');
    assert.equal(payload.utmSource, 'ig');
    assert.equal(payload.screenWidth, 390);
    assert.equal(payload.language, 'en-NG');
    assert.ok(JSON.stringify(payload.data).length < 2048, 'under the collector data limit');
});

test('ids come from the tracker cookies first', async () => {
    const browser = fakeBrowser({ cookies: { _tf_vid: 'vid-cookie', _tf_sid: 'sid-cookie' }, local: { _tf_vid: 'vid-local' } });
    const ids = await resolveIds(browser, 1000, () => 'new');
    assert.equal(ids.visitorId, 'vid-cookie');
    assert.equal(ids.sessionId, 'sid-cookie');
});

test('then from the tracker storage, ignoring an expired session', async () => {
    const live = fakeBrowser({ local: { _tf_vid: 'vid-local' }, session: { _tf_sid: JSON.stringify({ id: 'sid-live', expiry: 5000 }) } });
    const ids = await resolveIds(live, 1000, () => 'new');
    assert.equal(ids.visitorId, 'vid-local');
    assert.equal(ids.sessionId, 'sid-live');

    const expired = fakeBrowser({ session: { _tf_sid: JSON.stringify({ id: 'old', expiry: 500 }) } });
    assert.equal((await resolveIds(expired, 1000, () => 'new')).sessionId, 'new');
});

test('new ids are saved in the tracker format', async () => {
    const browser = fakeBrowser();
    await resolveIds(browser, 1000, () => 'fresh');
    assert.equal(browser.localStorage.values._tf_vid, 'fresh');
    assert.equal(liveSession(browser.sessionStorage.values._tf_sid, 1000), 'fresh');
    assert.equal(JSON.parse(browser.sessionStorage.values._tf_sid).expiry, 1000 + SESSION_EXPIRY);
});

test('blocked storage still gives ids', async () => {
    const fail = async () => { throw new Error('blocked'); };
    const browser = { cookie: { get: fail }, localStorage: { getItem: fail, setItem: fail }, sessionStorage: { getItem: fail, setItem: fail } };
    const ids = await resolveIds(browser, 1000, () => 'only');
    assert.equal(ids.visitorId, 'only');
    assert.equal(ids.sessionId, 'only');
});

test('send posts text/plain JSON to the collector and never throws', async () => {
    const calls = [];
    await send('TF-1A2B3C4D', { a: 1 }, async (url, init) => { calls.push([url, init]); });
    assert.equal(calls[0][0], `${COLLECT_URL}/TF-1A2B3C4D`);
    assert.equal(calls[0][1].headers['Content-Type'], 'text/plain;charset=UTF-8');
    assert.equal(calls[0][1].keepalive, true);
    assert.deepEqual(JSON.parse(calls[0][1].body), { a: 1 });

    await send('TF-1A2B3C4D', {}, () => Promise.reject(new Error('offline')));
});
