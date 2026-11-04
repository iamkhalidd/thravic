import type {
  CollectEvent,
  Environment,
  Experiment,
  NavigationRefLike,
  ThravicOptions,
} from './types';

export const VISITOR_KEY = '_tf_vid';
export const QUEUE_KEY = '_tf_queue';
export const OPT_OUT_KEY = '_tf_optout';

export const DEFAULT_API_URL = 'https://api.thravic.com';
/** The collector takes at most 50 events per batch. */
export const MAX_BATCH = 50;
/** Queued events kept while offline; the oldest go first. */
export const MAX_QUEUE = 1000;
/** Send without waiting for the timer once this many are queued. */
const FLUSH_AT = 10;
const MAX_RETRY_DELAY_MS = 30_000;
const PERSIST_DELAY_MS = 1_000;
/** How long `variant` waits for the running tests before answering null. */
export const TESTS_WAIT_MS = 3_000;

const DEFAULTS = {
  apiUrl: DEFAULT_API_URL,
  sessionTimeoutMinutes: 30,
  flushIntervalSeconds: 10,
  debug: false,
};

type Resolved = typeof DEFAULTS & ThravicOptions;

/** A v4-shaped id, like the web tracker's. Not cryptographic: ids only need to be unique. */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

/** FNV-1a, 32-bit, as a number in [0, 1). The web tracker's hash, so both split alike. */
export function unitHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * The version of `test` for `visitorId`, or null when they are outside its traffic
 * share. Worked out from a hash, so the same user always gets the same version,
 * exactly as the web tracker would give it.
 */
export function assignVariant(visitorId: string, test: Experiment): string | null {
  if (!test.variants.length) return null;
  if (unitHash(`${visitorId}:${test.id}:traffic`) >= test.traffic / 100) return null;
  const weights = test.variants.map((v) => Math.max(v.weight, 0));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const pick = unitHash(`${visitorId}:${test.id}:variant`);
  let edge = 0;
  for (let i = 0; i < test.variants.length; i++) {
    edge += total > 0 ? weights[i] / total : 1 / test.variants.length;
    if (pick < edge) return test.variants[i].id;
  }
  return test.variants[test.variants.length - 1].id;
}

/**
 * The SDK. Screen views are sent as `pageview` events on `app://<bundleId>/<Screen>`
 * URLs, so the dashboard's pages, paths and funnels work for apps as they do for
 * websites. Events are queued on the device and sent in batches; a batch the API
 * has not acknowledged stays queued and is retried, including after a restart.
 */
export class ThravicClient {
  private env: Environment;
  private trackingId = '';
  private options: Resolved = { ...DEFAULTS };
  private initialized = false;
  private ready = false;
  /** Calls made before storage has loaded, replayed in order once it has. */
  private pending: Array<() => void> = [];

  private visitorId = '';
  private sessionId = '';
  private sessionStart = 0;
  private backgroundAt: number | null = null;
  private currentScreen: string | null = null;
  private optedOut = false;

  private queue: CollectEvent[] = [];
  private sending = false;
  private retryAttempt = 0;
  private retryScheduled = false;
  private persistScheduled = false;
  private timer: unknown = null;
  private unsubscribeAppState: (() => void) | null = null;

  /** This session's running tests, loaded the first time `variant` is asked. */
  private tests: Promise<Experiment[]> | null = null;
  /** Tests whose `experiment_view` this session has already sent. */
  private exposed = new Set<string>();

  constructor(env: Environment) {
    this.env = env;
  }

  /** Start tracking. Call once, when the app starts; later calls are ignored. */
  async init(trackingId: string, options: ThravicOptions = {}): Promise<void> {
    if (this.initialized) return;
    if (!trackingId) {
      this.env.log('[Thravic] init needs your tracking ID, e.g. Thravic.init("TF-1A2B3C4D").');
      return;
    }
    this.initialized = true;
    this.trackingId = trackingId;
    this.options = { ...DEFAULTS, ...stripUndefined(options) };
    this.options.apiUrl = this.options.apiUrl.replace(/\/+$/, '');

    const { storage } = this.env;
    try {
      this.optedOut = (await storage.getItem(OPT_OUT_KEY)) === '1';
      this.visitorId = (await storage.getItem(VISITOR_KEY)) || '';
      if (!this.visitorId) {
        this.visitorId = generateId();
        await storage.setItem(VISITOR_KEY, this.visitorId);
      }
      this.queue = parseQueue(await storage.getItem(QUEUE_KEY));
    } catch (err) {
      // Storage unavailable: track this run only.
      this.visitorId = this.visitorId || generateId();
      this.debug('storage unavailable', err);
    }

    this.startSession();
    this.unsubscribeAppState = this.env.onAppStateChange((active) =>
      active ? this.foreground() : this.background(),
    );
    this.timer = this.env.setInterval(
      () => void this.flush(),
      this.options.flushIntervalSeconds * 1000,
    );

    this.ready = true;
    const pending = this.pending;
    this.pending = [];
    pending.forEach((call) => call());
    void this.flush();
  }

  /** Record a screen view. Automatic with `trackNavigation`; call it yourself otherwise. */
  screen(name: string, params?: Record<string, unknown>): void {
    this.whenReady(() => {
      const screen = String(name || '').trim().replace(/^\/+/, '');
      if (!screen) return;
      this.currentScreen = screen;
      this.enqueue('pageview', params && Object.keys(params).length ? { params } : undefined);
    });
  }

  /** Record a custom event, e.g. `track('purchase', { amount: 49 })`. */
  track(event: string, properties?: Record<string, unknown>): void {
    this.whenReady(() => {
      if (!event) return;
      this.enqueue('custom', { ...properties, event });
    });
  }

  /** Link this device to your own user id. Sent as the web tracker sends it. */
  identify(userId: string, traits?: Record<string, unknown>): void {
    this.whenReady(() => {
      if (!userId) return;
      this.enqueue('custom', { ...traits, event: 'identify', userId: String(userId) });
    });
  }

  /**
   * The version of A/B test `key` to show this user: a version id from the
   * dashboard, or null for the original (not in the test, the test is not
   * running, tracking is off, or the tests could not be loaded in time).
   * The first answer in a session records that the user saw the test.
   */
  variant(key: string): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.initialized) {
        this.env.log('[Thravic] Call Thravic.init before asking for a variant.');
        resolve(null);
        return;
      }
      this.whenReady(() => {
        if (this.optedOut) {
          resolve(null);
          return;
        }
        void this.loadTests().then((tests) => {
          const test = tests.find((t) => t.key === key);
          const id = test ? assignVariant(this.visitorId, test) : null;
          if (test && id && !this.exposed.has(test.id)) {
            this.exposed.add(test.id);
            this.enqueue('custom', { event: 'experiment_view', experiment: test.id, variant: id });
          }
          resolve(id);
        });
      });
    });
  }

  /** Stop tracking this device, and drop anything not yet sent. Remembered across launches. */
  optOut(): void {
    this.optedOut = true;
    this.queue = [];
    void this.env.storage.setItem(OPT_OUT_KEY, '1').catch(() => undefined);
    void this.env.storage.removeItem(QUEUE_KEY).catch(() => undefined);
  }

  /** Resume tracking after `optOut`. */
  optIn(): void {
    this.optedOut = false;
    void this.env.storage.removeItem(OPT_OUT_KEY).catch(() => undefined);
  }

  isOptedOut(): boolean {
    return this.optedOut;
  }

  /**
   * Record a screen view whenever the focused route changes. Pass the ref from
   * `createNavigationContainerRef()` / `useNavigationContainerRef()` (React
   * Navigation or Expo Router). Returns a function that stops it.
   */
  trackNavigation(ref: NavigationRefLike): () => void {
    let last: string | null = null;
    const onState = () => {
      if (ref.isReady && !ref.isReady()) return;
      const route = ref.getCurrentRoute();
      if (!route || route.name === last) return;
      last = route.name;
      this.screen(route.name);
    };
    const unsubscribe = ref.addListener('state', onState);
    onState();
    return unsubscribe;
  }

  /** Send everything queued now. Resolves when the attempt is done. */
  async flush(): Promise<void> {
    if (!this.ready || this.sending || this.optedOut || this.queue.length === 0) return;
    this.sending = true;
    const batch = this.queue.slice(0, MAX_BATCH);
    const sent = new Set(batch.map((e) => e.eventId));
    let more = false;
    try {
      const response = await this.env.fetch(
        `${this.options.apiUrl}/api/collect/${encodeURIComponent(this.trackingId)}/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: batch }),
        },
      );
      // A 4xx other than 429 will never succeed: drop the batch rather than
      // retrying it forever, as the web tracker does.
      const rejected =
        response.status >= 400 && response.status < 500 && response.status !== 429;
      if (!response.ok && !rejected) throw new Error(`HTTP ${response.status}`);
      if (rejected) this.debug(`batch rejected with ${response.status}`);

      this.queue = this.queue.filter((e) => !sent.has(e.eventId));
      this.retryAttempt = 0;
      this.persist();
      more = this.queue.length > 0;
    } catch (err) {
      this.debug('send failed, will retry', err);
      this.scheduleRetry();
    } finally {
      this.sending = false;
    }
    if (more) await this.flush();
  }

  /** Stop timers and listeners. For tests and hot reload; apps never need it. */
  shutdown(): void {
    if (this.timer !== null) this.env.clearInterval(this.timer);
    this.unsubscribeAppState?.();
    this.timer = null;
    this.unsubscribeAppState = null;
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  private startSession(): void {
    this.sessionId = generateId();
    this.sessionStart = this.env.now();
    this.backgroundAt = null;
    // A new session picks up tests started or ended since the last one.
    this.tests = null;
    this.exposed.clear();
    this.enqueue('custom', { event: 'app_open' });
  }

  private background(): void {
    if (!this.ready || this.backgroundAt !== null) return;
    this.backgroundAt = this.env.now();
    this.enqueue('session_end', {
      duration: Math.round((this.backgroundAt - this.sessionStart) / 1000),
      lastPage: this.screenUrl(),
    });
    void this.flush();
  }

  private foreground(): void {
    if (!this.ready || this.backgroundAt === null) return;
    const away = this.env.now() - this.backgroundAt;
    this.backgroundAt = null;
    if (away < this.options.sessionTimeoutMinutes * 60_000) return;

    // Long enough away that this is a new visit; it starts on the screen in view.
    this.startSession();
    if (this.currentScreen) this.enqueue('pageview');
  }

  // ── A/B tests ────────────────────────────────────────────────────────────

  /** The running tests, or none when they fail to load or take too long. */
  private loadTests(): Promise<Experiment[]> {
    if (!this.tests) {
      this.tests = new Promise((resolve) => {
        let done = false;
        const settle = (list: unknown) => {
          if (done) return;
          done = true;
          resolve(parseTests(list));
        };
        this.env.setTimeout(() => settle([]), TESTS_WAIT_MS);
        this.env
          .fetch(`${this.options.apiUrl}/api/collect/${encodeURIComponent(this.trackingId)}/config`)
          .then((response) => (response.ok ? response.json() : null))
          .then((config) => settle(config?.experiments))
          .catch((err) => {
            this.debug('tests could not be loaded', err);
            settle([]);
          });
      });
    }
    return this.tests;
  }

  // ── Queue ────────────────────────────────────────────────────────────────

  private whenReady(call: () => void): void {
    if (this.ready) call();
    else if (this.initialized) this.pending.push(call);
    else this.env.log('[Thravic] Call Thravic.init before tracking.');
  }

  private screenUrl(): string {
    const host = this.options.bundleId || 'app';
    return `app://${host}/${encodeURI(this.currentScreen || '')}`;
  }

  private enqueue(type: CollectEvent['type'], data?: Record<string, unknown>): void {
    if (this.optedOut) return;
    const device = this.env.device();
    const event: CollectEvent = {
      eventId: generateId(),
      type,
      url: this.screenUrl(),
      visitorId: this.visitorId,
      sessionId: this.sessionId,
      ...stripUndefined({
        os: device.os,
        osVersion: device.osVersion,
        deviceModel: device.deviceModel,
        appVersion: this.options.appVersion,
        screenWidth: device.screenWidth,
        screenHeight: device.screenHeight,
        language: device.language,
        data,
      }),
    };
    this.queue.push(event);
    if (this.queue.length > MAX_QUEUE) this.queue = this.queue.slice(-MAX_QUEUE);
    this.debug(type, event.url, data ?? '');
    this.persist();
    if (this.queue.length >= FLUSH_AT) void this.flush();
  }

  /** Write the queue to storage, at most once a second. */
  private persist(): void {
    if (this.persistScheduled) return;
    this.persistScheduled = true;
    this.env.setTimeout(() => {
      this.persistScheduled = false;
      const write =
        this.queue.length === 0
          ? this.env.storage.removeItem(QUEUE_KEY)
          : this.env.storage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
      void write.catch(() => undefined);
    }, PERSIST_DELAY_MS);
  }

  private scheduleRetry(): void {
    if (this.retryScheduled) return;
    this.retryScheduled = true;
    const delay = Math.min(1000 * 2 ** this.retryAttempt, MAX_RETRY_DELAY_MS);
    this.retryAttempt += 1;
    this.env.setTimeout(() => {
      this.retryScheduled = false;
      void this.flush();
    }, delay);
  }

  private debug(...args: unknown[]): void {
    if (this.options.debug) this.env.log('[Thravic]', ...args);
  }
}

function parseQueue(raw: string | null): CollectEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e === 'object' && typeof e.eventId === 'string')
      .slice(-MAX_QUEUE);
  } catch {
    return [];
  }
}

function parseTests(list: unknown): Experiment[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (t): t is Experiment =>
      !!t &&
      typeof t.id === 'string' &&
      typeof t.key === 'string' &&
      typeof t.traffic === 'number' &&
      Array.isArray(t.variants),
  );
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Partial<T>;
}
