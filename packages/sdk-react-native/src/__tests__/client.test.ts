import { describe, expect, it, vi } from 'vitest';

import {
  MAX_BATCH,
  OPT_OUT_KEY,
  QUEUE_KEY,
  ThravicClient,
  VISITOR_KEY,
  assignVariant,
  unitHash,
} from '../client';
import type { CollectEvent, Environment, NavigationRefLike } from '../types';

/** An Environment with in-memory storage, a hand-driven clock and timers, and a fetch spy. */
function fakeEnv(
  options: { status?: number; store?: Map<string, string>; tests?: unknown } = {},
) {
  const store = options.store ?? new Map<string, string>();
  const timers: Array<() => void> = [];
  const sent: CollectEvent[][] = [];
  let status = options.status ?? 200;
  let clock = 1_000_000;
  let appState: ((active: boolean) => void) | null = null;

  const fetchSpy = vi.fn(async (url: unknown, init?: { body?: unknown }) => {
    if (String(url).endsWith('/config')) {
      if (options.tests instanceof Error) throw options.tests;
      if (options.tests === 'hang') return new Promise<Response>(() => undefined);
      return { ok: true, status: 200, json: async () => ({ experiments: options.tests }) } as Response;
    }
    sent.push(JSON.parse(String(init?.body)).events);
    return { ok: status >= 200 && status < 300, status } as Response;
  });

  const env: Environment = {
    storage: {
      getItem: async (key) => store.get(key) ?? null,
      setItem: async (key, value) => void store.set(key, value),
      removeItem: async (key) => void store.delete(key),
    },
    device: () => ({
      os: 'iOS',
      osVersion: '18.1',
      deviceModel: 'iPhone',
      screenWidth: 393,
      screenHeight: 852,
      language: 'en-US',
    }),
    fetch: fetchSpy as unknown as typeof fetch,
    now: () => clock,
    onAppStateChange(listener) {
      appState = listener;
      return () => {
        appState = null;
      };
    },
    setInterval: () => 1,
    clearInterval: () => undefined,
    setTimeout(fn) {
      timers.push(fn);
      return timers.length;
    },
    log: vi.fn(),
  };

  return {
    env,
    store,
    sent,
    fetchSpy,
    setStatus: (s: number) => (status = s),
    advance: (ms: number) => (clock += ms),
    /** Fire every pending timer (queue writes and retries), as if their time had come. */
    runTimers: () => timers.splice(0).forEach((fn) => fn()),
    appState: (active: boolean) => appState?.(active),
  };
}

/** Let the client's un-awaited sends finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function started(opts: Parameters<typeof fakeEnv>[0] = {}) {
  const fake = fakeEnv(opts);
  const client = new ThravicClient(fake.env);
  await client.init('TF-TEST1234', {
    apiUrl: 'https://api.example.com/',
    bundleId: 'com.acme.shop',
    appVersion: '1.4.0',
  });
  await settle();
  return { ...fake, client };
}

async function sendAll(client: ThravicClient) {
  await settle();
  await client.flush();
  await settle();
}

const all = (sent: CollectEvent[][]) => sent.flat();

describe('ThravicClient', () => {
  it('opens a session with the device and app version on every event', async () => {
    const { sent, fetchSpy, store } = await started();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.com/api/collect/TF-TEST1234/batch',
      expect.objectContaining({ method: 'POST' }),
    );
    const [open] = all(sent);
    expect(open).toMatchObject({
      type: 'custom',
      data: { event: 'app_open' },
      url: 'app://com.acme.shop/',
      os: 'iOS',
      osVersion: '18.1',
      deviceModel: 'iPhone',
      appVersion: '1.4.0',
      screenWidth: 393,
    });
    expect(open.visitorId).toBe(store.get(VISITOR_KEY));
  });

  it('keeps the visitor id across launches', async () => {
    const first = await started();
    const visitorId = first.store.get(VISITOR_KEY);

    const second = await started({ store: first.store });
    expect(all(second.sent)[0].visitorId).toBe(visitorId);
  });

  it('sends screens as pageviews on app:// urls, and events and identify as custom', async () => {
    const { client, sent } = await started();

    client.screen('Product Detail', { id: 7 });
    client.track('purchase', { amount: 49 });
    client.identify('user-42');
    await sendAll(client);

    const events = all(sent).slice(1);
    expect(events[0]).toMatchObject({
      type: 'pageview',
      url: 'app://com.acme.shop/Product%20Detail',
      data: { params: { id: 7 } },
    });
    expect(events[1]).toMatchObject({
      type: 'custom',
      url: 'app://com.acme.shop/Product%20Detail',
      data: { event: 'purchase', amount: 49 },
    });
    expect(events[2]).toMatchObject({ data: { event: 'identify', userId: 'user-42' } });
  });

  it('replays calls made before storage has loaded, in order', async () => {
    const fake = fakeEnv();
    const client = new ThravicClient(fake.env);
    const ready = client.init('TF-TEST1234', { bundleId: 'com.acme.shop' });
    client.screen('Home');
    client.track('tapped');
    await ready;
    await settle();

    expect(all(fake.sent).map((e) => e.type)).toEqual(['custom', 'pageview', 'custom']);
    expect(all(fake.sent)[1].url).toBe('app://com.acme.shop/Home');
  });

  it('warns instead of throwing when used before init', () => {
    const fake = fakeEnv();
    const client = new ThravicClient(fake.env);

    expect(() => client.track('early')).not.toThrow();
    expect(fake.env.log).toHaveBeenCalled();
    expect(fake.fetchSpy).not.toHaveBeenCalled();
  });

  it('drops a batch the API rejects with a 4xx', async () => {
    const { client, sent, setStatus } = await started({ status: 400 });
    setStatus(200);

    client.track('after');
    await sendAll(client);

    // The rejected app_open is not sent again.
    expect(sent[1].map((e) => e.data?.event)).toEqual(['after']);
  });

  it('keeps a batch the API fails and retries it', async () => {
    const { client, sent, setStatus, runTimers } = await started({ status: 503 });
    expect(sent).toHaveLength(1);

    setStatus(200);
    runTimers();
    await settle();

    expect(sent).toHaveLength(2);
    expect(sent[1][0].data).toEqual({ event: 'app_open' });
    await sendAll(client);
    expect(sent).toHaveLength(2);
  });

  it('keeps unsent events on the device for the next launch', async () => {
    const first = await started({ status: 503 });
    first.client.track('offline');
    first.runTimers(); // writes the queue (and retries, which fails again)
    await settle();
    expect(JSON.parse(first.store.get(QUEUE_KEY) ?? '[]')).toHaveLength(2);

    const second = await started({ store: first.store });
    const events = all(second.sent).map((e) => e.data?.event);
    expect(events).toEqual(['app_open', 'offline', 'app_open']);
  });

  it('sends at most one batch size at a time', async () => {
    const { client, sent, setStatus } = await started({ status: 503 });
    for (let i = 0; i < 120; i += 1) client.track(`e${i}`);
    await settle();
    setStatus(200);
    sent.length = 0;

    await sendAll(client);

    // app_open plus 120 events.
    expect(sent.map((b) => b.length)).toEqual([MAX_BATCH, MAX_BATCH, 21]);
  });

  it('ends the session in the background and starts a new one after the timeout', async () => {
    const { client, sent, appState, advance } = await started();
    client.screen('Home');
    const sessionId = all(sent)[0].sessionId;

    advance(90_000);
    appState(false);
    await settle();
    const end = all(sent).find((e) => e.type === 'session_end');
    expect(end).toMatchObject({ data: { duration: 90, lastPage: 'app://com.acme.shop/Home' } });

    // Back within the timeout: same session.
    advance(60_000);
    appState(true);
    client.track('same');
    await sendAll(client);
    expect(all(sent).slice(-1)[0].sessionId).toBe(sessionId);

    // Away longer than the timeout: a new session, starting on the screen in view.
    appState(false);
    advance(31 * 60_000);
    appState(true);
    await sendAll(client);
    const [open, view] = all(sent).slice(-2);
    expect(open.data).toEqual({ event: 'app_open' });
    expect(view).toMatchObject({ type: 'pageview', url: 'app://com.acme.shop/Home' });
    expect(view.sessionId).not.toBe(sessionId);
  });

  it('stops tracking after optOut, remembered across launches', async () => {
    const first = await started();
    first.client.optOut();
    first.client.track('hidden');
    await sendAll(first.client);

    expect(all(first.sent).map((e) => e.data?.event)).toEqual(['app_open']);
    expect(first.store.get(OPT_OUT_KEY)).toBe('1');
    expect(first.client.isOptedOut()).toBe(true);

    const second = await started({ store: first.store });
    expect(second.fetchSpy).not.toHaveBeenCalled();

    second.client.optIn();
    second.client.track('visible');
    await sendAll(second.client);
    expect(all(second.sent).map((e) => e.data?.event)).toEqual(['visible']);
  });

  it('records a screen view each time the focused route changes', async () => {
    const { client, sent } = await started();
    let route = 'Home';
    let notify: () => void = () => undefined;
    const ref: NavigationRefLike = {
      addListener: (_event, listener) => {
        notify = listener;
        return () => undefined;
      },
      getCurrentRoute: () => ({ name: route }),
      isReady: () => true,
    };

    client.trackNavigation(ref);
    notify(); // same route: ignored
    route = 'Cart';
    notify();
    await sendAll(client);

    expect(all(sent).filter((e) => e.type === 'pageview').map((e) => e.url)).toEqual([
      'app://com.acme.shop/Home',
      'app://com.acme.shop/Cart',
    ]);
  });
});

describe('A/B tests', () => {
  const TEST = {
    id: 'e1',
    key: 'new-paywall',
    traffic: 100,
    variants: [
      { id: 'a', weight: 50 },
      { id: 'b', weight: 50 },
    ],
  };
  const visitor = (id: string) => new Map([[VISITOR_KEY, id]]);
  const views = (sent: CollectEvent[][]) =>
    all(sent).filter((e) => e.data?.event === 'experiment_view');

  it('hashes exactly as the web tracker does', () => {
    // Values from the web tracker's FNV-1a hash
    expect(unitHash('visitor-1:e1:traffic')).toBe(0.5652977614663541);
    expect(unitHash('visitor-1:e1:variant')).toBe(0.7874152301810682);
    expect(unitHash('')).toBe(0.5043428998906165);
    expect(assignVariant('visitor-1', TEST)).toBe('b');
  });

  it('splits users by the weights and keeps each one on a version', () => {
    const counts = { a: 0, b: 0, none: 0 };
    const half = { ...TEST, traffic: 50, variants: [{ id: 'a', weight: 75 }, { id: 'b', weight: 25 }] };
    for (let i = 0; i < 20000; i++) {
      const id = assignVariant(`user-${i}`, half);
      counts[(id ?? 'none') as keyof typeof counts] += 1;
      expect(assignVariant(`user-${i}`, half)).toBe(id);
    }
    expect(counts.none / 20000).toBeCloseTo(0.5, 1);
    expect(counts.a / (counts.a + counts.b)).toBeCloseTo(0.75, 1);
  });

  it('answers with the version and records the view once a session', async () => {
    const { client, sent, fetchSpy, advance, appState } = await started({
      store: visitor('visitor-1'),
      tests: [TEST],
    });
    expect(await client.variant('new-paywall')).toBe('b');
    expect(await client.variant('new-paywall')).toBe('b');
    expect(fetchSpy).toHaveBeenCalledWith('https://api.example.com/api/collect/TF-TEST1234/config');
    await sendAll(client);
    expect(views(sent).map((e) => e.data)).toEqual([
      { event: 'experiment_view', experiment: 'e1', variant: 'b' },
    ]);

    // A new session loads the tests again and records the view again
    appState(false);
    advance(31 * 60_000);
    appState(true);
    expect(await client.variant('new-paywall')).toBe('b');
    await sendAll(client);
    expect(views(sent)).toHaveLength(2);
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/config'))).toHaveLength(2);
  });

  it('gives null for a test that is not running, and records nothing', async () => {
    const { client, sent } = await started({ tests: [TEST] });
    expect(await client.variant('something-else')).toBeNull();
    await sendAll(client);
    expect(views(sent)).toEqual([]);
  });

  it('gives null when the tests fail to load or take too long', async () => {
    const failing = await started({ tests: new Error('offline') });
    expect(await failing.client.variant('new-paywall')).toBeNull();

    const slow = await started({ tests: 'hang' });
    const answer = slow.client.variant('new-paywall');
    await settle();
    slow.runTimers();
    expect(await answer).toBeNull();
  });

  it('asks nothing of the API for an opted-out user', async () => {
    const { client, fetchSpy } = await started({ tests: [TEST] });
    client.optOut();
    expect(await client.variant('new-paywall')).toBeNull();
    expect(fetchSpy.mock.calls.some(([url]) => String(url).endsWith('/config'))).toBe(false);
  });

  it('waits for init, and gives null without it', async () => {
    const fake = fakeEnv({ store: visitor('visitor-1'), tests: [TEST] });
    const client = new ThravicClient(fake.env);
    expect(await client.variant('new-paywall')).toBeNull();

    const early = new ThravicClient(fakeEnv({ store: visitor('visitor-1'), tests: [TEST] }).env);
    const starting = early.init('TF-TEST1234');
    const answer = early.variant('new-paywall');
    await starting;
    expect(await answer).toBe('b');
  });
});
