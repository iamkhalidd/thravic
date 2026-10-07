/**
 * Build source for the Thravic tracking script served at /tf.js and /v.js.
 *
 * esbuild (see ../package.json) bundles this file into ../app/static/tracker.js,
 * which IS the artifact the API serves. That built file is committed to the
 * repo and must be regenerated with `npm run build` after every change here;
 * do not hand-edit it. The apiUrl placeholder that the API interpolates at
 * serve time (app/routers/tracker.py) lives in the default endpoint below.
 */

/**
 * Thravic Analytics - Lightweight Tracking Script
 *
 * Features:
 * - Page view tracking
 * - Click tracking (with PII-safe text capture)
 * - Scroll depth tracking
 * - UTM parameter capture
 * - Session management
 * - Batch event sending via sendBeacon / fetch
 * - Privacy-respecting: no fingerprinting, DNT respected
 * - Consent mode: optionally delay tracking until user accepts
 * - Form submission tracking
 * - Error / crash tracking (window.onerror + unhandledrejection)
 * - Performance metrics (Web Vitals: LCP, FID, CLS, TTFB, FCP)
 * - Rage-click detection
 * - Session recording: rrweb screen capture, loaded on demand from /recorder.js
 */

interface TFConfig {
    /**
     * Base URL of your Thravic server, e.g. https://analytics.yourdomain.com/api/collect
     * Defaults to the hosted Thravic service.
     * Set via window.TF.endpoint before calling init(), or pass in config.
     */
    endpoint: string;
    batchSize: number;
    batchInterval: number;
    trackClicks: boolean;
    trackScrolls: boolean;
    /** Honour the browser Do-Not-Track header. Default: true */
    respectDoNotTrack: boolean;
    /**
     * Consent mode: when true, all tracking is paused until
     * `TF('consent', 'granted')` is called (e.g. after cookie banner accepted).
     * Default: false
     */
    requireConsent: boolean;
    /**
     * Max characters of click element text to capture.
     * Set to 0 to disable text capture entirely (safest for GDPR).
     * Default: 50
     */
    clickTextMaxLength: number;
    /** Track form submissions. Default: true */
    trackForms: boolean;
    /** Track JavaScript errors & unhandled promise rejections. Default: true */
    trackErrors: boolean;
    /** Capture Web Vitals performance metrics. Default: true */
    trackPerformance: boolean;
    /** Record sessions for screen replay (rrweb, inputs masked). Default: false — opt-in, heavier */
    trackRecordings: boolean;
    /** Maximum recording duration in ms. Default: 600 000 (10 min) */
    recordingMaxDuration: number;
    /** Percent of visits recorded (the dashboard's choice). Default: 100 */
    recordingSampleRate: number;
    /** Ask the visitor before recording, with the tracker's own prompt. Default: true.
     *  When off, recording needs the site's own consent: requireConsent plus
     *  TF('consent', 'granted'). Nothing is recorded without one or the other. */
    recordingConsentPrompt: boolean;
}

interface TFEvent {
    /** Client-generated id. The server treats it as an idempotency key, so a
     *  retried delivery of the same event is never counted twice. */
    eventId: string;
    type: 'pageview' | 'click' | 'scroll' | 'form' | 'custom' | 'session_end';
    url: string;
    referrer: string | null;
    visitorId: string;
    sessionId: string;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmTerm: string | null;
    utmContent: string | null;
    screenWidth: number | null;
    screenHeight: number | null;
    language: string | null;
    data?: Record<string, unknown>;
}

// ── Recording (rrweb) ──
// The recorder's API as far as the tracker uses it; recorder.ts provides it.
interface RecordedEvent {
    type: number;
    timestamp: number;
    [key: string]: unknown;
}
type RecordFn = (options: {
    emit: (event: RecordedEvent) => void;
    [option: string]: unknown;
}) => (() => void) | undefined;
interface StoredRecording {
    id: string;
    sessionId: string;
    startedAt: number;
}

// Storage keys
const VISITOR_KEY = '_tf_vid';
const SESSION_KEY = '_tf_sid';
const SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes

// Undelivered events are mirrored here so a failed send, a reload or a closed
// tab cannot lose them. The server dedupes on `eventId`, so re-sending is safe.
const QUEUE_KEY = '_tf_queue';
const MAX_QUEUE_EVENTS = 200;
// Stop retrying in-page after this many consecutive failures; the persisted
// queue is picked up again on the next page load.
const MAX_SEND_ATTEMPTS = 5;

// Default configuration
const defaultConfig: TFConfig = {
    // Interpolated at serve time by the API (SERVER_URL or API_URL); relative
    // "/api/collect" when neither is configured.
    endpoint: '${apiUrl}/api/collect',
    batchSize: 10,
    batchInterval: 5000,
    trackClicks: true,
    trackScrolls: true,
    respectDoNotTrack: true,
    requireConsent: false,
    clickTextMaxLength: 50,
    trackForms: true,
    trackErrors: true,
    trackPerformance: true,
    trackRecordings: false,
    recordingMaxDuration: 600_000,
    recordingSampleRate: 100,
    recordingConsentPrompt: true,
};

const SCROLL_MILESTONES = [25, 50, 75, 100];

// Deliver `payload` as the page is going away. sendBeacon always sends
// credentials, so a JSON body would need a CORS preflight that the collector's
// wildcard `Access-Control-Allow-Origin` cannot pass - the browser drops it.
// text/plain is a CORS-safelisted type: no preflight, and the collector parses
// the body as JSON whatever its content type.
function beacon(url: string, payload: unknown): void {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) {
        return;
    }
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
    }).catch(() => {});
}

// Settings the dashboard controls (GET {endpoint}/{trackingId}/config).
const REMOTE_CONFIG_KEYS = [
    'trackClicks', 'trackScrolls', 'trackForms', 'trackRecordings', 'recordingConsentPrompt',
] as const;
const REMOTE_CONFIG_NUMBERS = ['recordingSampleRate'] as const;

// ── Rage-click constants ──
const RAGE_CLICK_THRESHOLD = 3;      // clicks needed
const RAGE_CLICK_WINDOW   = 800;     // ms

// ── Recording constants ──
const REC_STORAGE_KEY = '_tf_rec';
const REC_SAMPLE_KEY = '_tf_rec_sample';   // this visit's in/out of the sample
const REC_CONSENT_KEY = '_tf_rec_consent'; // the visitor's answer to the prompt
const REC_CONSENT_DAYS = 180;              // how long that answer is kept
const REC_FLUSH_INTERVAL = 5000;         // ms between recording uploads
const REC_FLUSH_BYTES = 512 * 1024;      // upload early once this much is buffered
const BEACON_MAX_BYTES = 60 * 1024;      // under the browsers' 64 KB beacon cap
const RRWEB_FULL_SNAPSHOT = 2;           // rrweb EventType.FullSnapshot

class ThravicAnalytics {
    private trackingId: string = '';
    private config: TFConfig = defaultConfig;
    /** What the page set itself (__TF_CONFIG__ / init config); wins over the dashboard. */
    private pageConfig: Partial<TFConfig> = {};
    private eventQueue: TFEvent[] = [];
    private batchTimer: number | null = null;
    /** A send is in flight — never start a second one. */
    private sending: boolean = false;
    private retryTimer: number | null = null;
    private retryAttempt: number = 0;
    private scrollDepth: number = 0;
    private initialized: boolean = false;
    /** When requireConsent=true, tracking is paused until consent is granted */
    private consentGranted: boolean = false;
    /** Timestamp of the current page view — session_end duration is measured from it */
    private pageStart: number = 0;
    /** Per-page fallbacks when storage is unavailable (private mode / blocked) */
    private ephemeralVisitorId: string | null = null;
    private ephemeralSessionId: string | null = null;

    // ── Rage-click state ──
    private rageClickMap = new WeakMap<EventTarget, number[]>();

    // ── Recording state ──
    private recordingId: string | null = null;
    private recordingStarting: boolean = false;
    private recordingEvents: RecordedEvent[] = [];
    private recordingBytes: number = 0;
    private recordingStartTime: number = 0;
    private recordingFlushTimer: number | null = null;
    private stopRecorder: (() => void) | null = null;

    // ── Performance state ──
    private perfSent: boolean = false;

    // ────────────────────────────────────
    //  Utility helpers
    // ────────────────────────────────────

    // Generate a random UUID-v4-like ID
    private generateId(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    // Get or create visitor ID (falls back to a per-page id when storage is blocked)
    private getVisitorId(): string {
        if (this.ephemeralVisitorId) return this.ephemeralVisitorId;
        try {
            let visitorId = localStorage.getItem(VISITOR_KEY);
            if (!visitorId) {
                visitorId = this.generateId();
                localStorage.setItem(VISITOR_KEY, visitorId);
            }
            return visitorId;
        } catch {
            this.ephemeralVisitorId = this.generateId();
            return this.ephemeralVisitorId;
        }
    }

    // Get or create session ID.
    //
    // Accepts both storage shapes: the {id, expiry} JSON this tracker writes and
    // the bare id string the previous tracker stored at the same key — a
    // returning visitor mid-upgrade must not crash here.
    private getSessionId(): string {
        if (this.ephemeralSessionId) return this.ephemeralSessionId;

        let stored: string | null = null;
        try {
            stored = sessionStorage.getItem(SESSION_KEY);
        } catch { /* storage blocked */ }

        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (
                    parsed && typeof parsed === 'object' &&
                    typeof parsed.id === 'string' && typeof parsed.expiry === 'number'
                ) {
                    if (Date.now() < parsed.expiry) {
                        // Refresh session
                        try {
                            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                                id: parsed.id,
                                expiry: Date.now() + SESSION_EXPIRY
                            }));
                        } catch { /* blocked */ }
                        return parsed.id;
                    }
                    // Expired — fall through to a new session.
                }
            } catch {
                // Legacy bare-string session id from the previous tracker.
                try {
                    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                        id: stored,
                        expiry: Date.now() + SESSION_EXPIRY
                    }));
                } catch { /* blocked */ }
                return stored;
            }
        }

        // Create new session
        const sessionId = this.generateId();
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                id: sessionId,
                expiry: Date.now() + SESSION_EXPIRY
            }));
        } catch {
            this.ephemeralSessionId = sessionId;
        }
        return sessionId;
    }

    // Parse UTM parameters from URL
    private getUtmParams(): Record<string, string | null> {
        const params = new URLSearchParams(window.location.search);
        return {
            utmSource: params.get('utm_source'),
            utmMedium: params.get('utm_medium'),
            utmCampaign: params.get('utm_campaign'),
            utmTerm: params.get('utm_term'),
            utmContent: params.get('utm_content')
        };
    }

    // Check Do Not Track and consent
    private shouldTrack(): boolean {
        // Respect consent mode — do not track until consent is explicitly granted
        if (this.config.requireConsent && !this.consentGranted) {
            return false;
        }
        // Respect browser Do-Not-Track header
        if (this.config.respectDoNotTrack) {
            const dnt = navigator.doNotTrack || (window as any).doNotTrack;
            if (dnt === '1' || dnt === 'yes') {
                return false;
            }
        }
        return true;
    }

    // Grant consent (call after user accepts cookie banner)
    public grantConsent(): void {
        this.consentGranted = true;
        // Flush any queued events that were held
        if (this.eventQueue.length > 0) {
            this.flush();
        }
        // Track the page view that was missed while waiting for consent
        this.trackPageView();
        if (this.config.trackRecordings && this.initialized) {
            this.startRecording();
        }
    }

    // The visitor withdraws their yes to recording: stop now and don't ask again
    // for REC_CONSENT_DAYS. Analytics without recording carry on.
    public revokeRecordingConsent(): void {
        try {
            localStorage.setItem(REC_CONSENT_KEY, JSON.stringify({ answer: 'denied', at: Date.now() }));
        } catch { /* blocked */ }
        this.endRecording();
    }

    // Revoke consent (e.g. user withdraws permission)
    public revokeConsent(): void {
        this.consentGranted = false;
        // Clear any queued events, including the persisted copy.
        this.eventQueue = [];
        this.persistQueue();
        this.endRecording();
    }

    // ────────────────────────────────────
    //  Event creation & dispatch
    // ────────────────────────────────────

    // Create base event object
    private createEvent(type: TFEvent['type'], data?: Record<string, unknown>): TFEvent {
        const utm = this.getUtmParams();
        return {
            eventId: this.generateId(),
            type,
            url: window.location.href,
            referrer: document.referrer || null,
            visitorId: this.getVisitorId(),
            sessionId: this.getSessionId(),
            utmSource: utm.utmSource,
            utmMedium: utm.utmMedium,
            utmCampaign: utm.utmCampaign,
            utmTerm: utm.utmTerm,
            utmContent: utm.utmContent,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            language: navigator.language,
            data
        };
    }

    // ────────────────────────────────────
    //  Durable queue
    // ────────────────────────────────────

    // Restore anything a previous page could not deliver.
    private loadPersistedQueue(): void {
        try {
            const raw = localStorage.getItem(QUEUE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;
            this.eventQueue = parsed
                .filter((e) => e && typeof e === 'object' && typeof e.eventId === 'string')
                .slice(-MAX_QUEUE_EVENTS);
        } catch { /* storage blocked, or the value is corrupt */ }
    }

    private persistQueue(): void {
        try {
            if (this.eventQueue.length === 0) {
                localStorage.removeItem(QUEUE_KEY);
                return;
            }
            localStorage.setItem(
                QUEUE_KEY,
                JSON.stringify(this.eventQueue.slice(-MAX_QUEUE_EVENTS))
            );
        } catch { /* storage blocked — the queue stays in memory only */ }
    }

    // Queue an event
    private queueEvent(event: TFEvent): void {
        if (!this.shouldTrack()) return;

        this.eventQueue.push(event);
        // Bound the queue: an unreachable endpoint must not grow it forever.
        if (this.eventQueue.length > MAX_QUEUE_EVENTS) {
            this.eventQueue = this.eventQueue.slice(-MAX_QUEUE_EVENTS);
        }
        this.persistQueue();

        if (this.eventQueue.length >= this.config.batchSize) {
            this.flush();
        }
    }

    // Send analytics events to the server.
    //
    // Delivery is at-least-once. The queue is mirrored into localStorage and an
    // event is only dropped once the server has acknowledged the batch; a failed
    // send is retried with backoff, and whatever is left is replayed on the next
    // page load. Each event carries a client-generated `eventId` that the server
    // treats as an idempotency key, so a duplicate delivery is not counted twice.
    //
    // `final` marks the unload path: `sendBeacon` is the only transport that
    // survives it, but it reports no status, so those events stay queued and are
    // confirmed by the next page load.
    private flush(final: boolean = false): void {
        if (this.eventQueue.length === 0) return;
        if (!this.shouldTrack()) return;

        const events = [...this.eventQueue];
        // Batch endpoint: POST /api/collect/:trackingId/batch
        const batchUrl = `${this.config.endpoint}/${this.trackingId}/batch`;

        if (final) {
            beacon(batchUrl, { events });
            return;
        }

        if (this.sending) return;
        this.sending = true;

        const sentIds = new Set(events.map((e) => e.eventId));

        fetch(batchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events }),
            keepalive: true,
        })
            .then((res) => {
                // A 4xx (except 429) is a permanent rejection — a payload the
                // server will never accept. Retrying it forever only burns the
                // visitor's connection, so it is dropped along with the
                // acknowledged case. 429 means "slow down", so that one retries.
                const permanent =
                    res.status >= 400 && res.status < 500 && res.status !== 429;
                if (!res.ok && !permanent) throw new Error(`HTTP ${res.status}`);

                // Done with these events either way.
                this.eventQueue = this.eventQueue.filter((e) => !sentIds.has(e.eventId));
                this.persistQueue();
                this.retryAttempt = 0;
            })
            .catch(() => this.scheduleRetry())
            .finally(() => { this.sending = false; });
    }

    private scheduleRetry(): void {
        if (this.retryTimer !== null) return;
        if (this.retryAttempt >= MAX_SEND_ATTEMPTS) return;

        const delay = Math.min(1000 * Math.pow(2, this.retryAttempt), 30_000);
        this.retryAttempt += 1;
        this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            this.flush();
        }, delay);
    }

    // ────────────────────────────────────
    //  Page View tracking
    // ────────────────────────────────────

    private trackPageView(): void {
        this.pageStart = Date.now();
        this.queueEvent(this.createEvent('pageview'));

        // A page that fits in the viewport never fires `scroll`; check it once the
        // content (or a SPA route's content) has had a moment to render.
        if (this.config.trackScrolls) {
            window.setTimeout(() => this.trackScroll(), 1000);
        }
    }

    // ────────────────────────────────────
    //  Click tracking  (existing)
    // ────────────────────────────────────

    // Sanitise element text — strips whitespace and caps length to avoid PII capture
    private sanitiseText(raw: string | null | undefined): string | undefined {
        if (!raw) return undefined;
        const maxLen = this.config.clickTextMaxLength;
        if (maxLen <= 0) return undefined; // text capture disabled
        const cleaned = raw.replace(/\s+/g, ' ').trim();
        return cleaned.slice(0, maxLen) || undefined;
    }

    private trackClick(e: MouseEvent): void {
        if (!this.config.trackClicks) return;
        const target = e.target as HTMLElement;
        if (!target) return;

        // ── Rage-click detection ──────────────────
        this.detectRageClick(e);

        const data: Record<string, unknown> = {
            // x/y are viewport pixels; the heatmap needs them relative to the page,
            // so the viewport width and the page-space y and height go with them.
            x: e.clientX,
            y: e.clientY,
            pageY: e.pageY,
            viewportWidth: window.innerWidth,
            docHeight: document.documentElement.scrollHeight,
            tag: target.tagName.toLowerCase(),
            id: target.id || undefined,
            // Limit className to avoid leaking long dynamic class strings
            className: typeof target.className === 'string'
                ? target.className.slice(0, 100) || undefined
                : undefined,
            // Sanitised & capped text — set clickTextMaxLength:0 to disable entirely
            text: this.sanitiseText(target.textContent),
        };

        // Track if it's a link — use pathname only to avoid leaking query params
        const link = target.closest('a');
        if (link) {
            try {
                // Only capture the path+hash, never the full href with sensitive query params
                const parsed = new URL(link.href);
                data.href = parsed.origin + parsed.pathname + parsed.hash;
            } catch {
                data.href = link.getAttribute('href') || undefined;
            }
        }

        this.queueEvent(this.createEvent('click', data));
    }

    // ────────────────────────────────────
    //  Scroll depth tracking  (existing)
    // ────────────────────────────────────

    private trackScroll(): void {
        if (!this.config.trackScrolls) return;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        // A page that fits in the viewport is fully seen without scrolling.
        const scrollPercent = scrollable > 0 ? Math.round((scrollTop / scrollable) * 100) : 100;

        // Report each 25% milestone once, including any skipped by a fast scroll
        // (scroll events are sampled, so the exact value 25 is rarely observed).
        for (const milestone of SCROLL_MILESTONES) {
            if (milestone > this.scrollDepth && scrollPercent >= milestone) {
                this.scrollDepth = milestone;
                this.queueEvent(this.createEvent('scroll', { depth: milestone }));
            }
        }
    }

    // ────────────────────────────────────
    //  Form tracking  (NEW)
    // ────────────────────────────────────

    private trackFormSubmit(e: Event): void {
        if (!this.config.trackForms) return;
        const form = e.target as HTMLFormElement;
        if (!form || form.tagName !== 'FORM') return;

        // Read attributes, not properties: a form containing a field named `name`,
        // `id`, `action` or `method` makes `form.name` etc. return that field
        // element instead of the form's own value (it was recorded as `{}`).
        const attr = (name: string) => form.getAttribute(name) || undefined;

        let actionPath: string | undefined;
        try {
            actionPath = new URL(attr('action') || window.location.href, window.location.href).pathname;
        } catch {
            actionPath = attr('action');
        }

        const data: Record<string, unknown> = {
            formId: attr('id'),
            formName: attr('name'),
            action: actionPath,
            method: (attr('method') || 'get').toUpperCase(),
            fieldCount: form.elements.length,
        };

        this.queueEvent(this.createEvent('form', data));
    }

    // ────────────────────────────────────
    //  Error / Crash tracking  (NEW)
    // ────────────────────────────────────

    private trackError(
        message: string,
        source?: string,
        line?: number,
        col?: number,
        stack?: string
    ): void {
        const data: Record<string, unknown> = {
            event: 'error',
            message: typeof message === 'string' ? message.slice(0, 200) : String(message),
            source: source || undefined,
            line: line || undefined,
            col: col || undefined,
            // Truncate stack to 500 chars to avoid PII leakage & large payloads
            stack: stack ? stack.slice(0, 500) : undefined,
        };

        this.queueEvent(this.createEvent('custom', data));
        // Flush immediately — the page might be about to crash
        this.flush();
    }

    private setupErrorTracking(): void {
        // Global error handler
        window.addEventListener('error', (e: ErrorEvent) => {
            this.trackError(
                e.message,
                e.filename,
                e.lineno,
                e.colno,
                e.error?.stack
            );
        });

        // Unhandled promise rejections
        window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
            const reason = e.reason;
            const message = reason instanceof Error ? reason.message : String(reason);
            const stack = reason instanceof Error ? reason.stack : undefined;
            this.trackError(message, undefined, undefined, undefined, stack);
        });
    }

    // ────────────────────────────────────
    //  Performance Metrics / Web Vitals  (NEW)
    // ────────────────────────────────────

    private setupPerformanceTracking(): void {
        // Wait for the page to fully load before collecting metrics
        if (document.readyState === 'complete') {
            this.collectPerfMetrics();
        } else {
            window.addEventListener('load', () => {
                // Give the browser a moment to settle, then collect
                setTimeout(() => this.collectPerfMetrics(), 1000);
            });
        }
    }

    private collectPerfMetrics(): void {
        if (this.perfSent) return;

        const metrics: Record<string, unknown> = {
            event: 'performance',
        };

        // ── Navigation Timing (TTFB) ──
        try {
            const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
            if (nav) {
                metrics.ttfb = Math.round(nav.responseStart - nav.requestStart);
                metrics.domContentLoaded = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
                metrics.loadTime = Math.round(nav.loadEventEnd - nav.startTime);
            }
        } catch { /* not supported */ }

        // ── Paint Timing (FCP) ──
        try {
            const paints = performance.getEntriesByType('paint');
            for (const entry of paints) {
                if (entry.name === 'first-contentful-paint') {
                    metrics.fcp = Math.round(entry.startTime);
                }
            }
        } catch { /* not supported */ }

        // ── LCP via PerformanceObserver ──
        this.observeLCP(metrics);
        // ── FID via PerformanceObserver ──
        this.observeFID(metrics);
        // ── CLS via PerformanceObserver ──
        this.observeCLS(metrics);

        // After a delay, send whatever metrics we've gathered (observers may not fire on every page)
        setTimeout(() => {
            if (this.perfSent) return;
            this.perfSent = true;
            this.queueEvent(this.createEvent('custom', { ...metrics }));
        }, 5000);
    }

    private observeLCP(metrics: Record<string, unknown>): void {
        try {
            const obs = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                if (entries.length > 0) {
                    metrics.lcp = Math.round(entries[entries.length - 1].startTime);
                }
            });
            obs.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch { /* not supported */ }
    }

    private observeFID(metrics: Record<string, unknown>): void {
        try {
            const obs = new PerformanceObserver((list) => {
                const entries = list.getEntries() as PerformanceEventTiming[];
                if (entries.length > 0) {
                    metrics.fid = Math.round(entries[0].processingStart - entries[0].startTime);
                }
            });
            obs.observe({ type: 'first-input', buffered: true });
        } catch { /* not supported */ }
    }

    private observeCLS(metrics: Record<string, unknown>): void {
        try {
            let clsValue = 0;
            const obs = new PerformanceObserver((list) => {
                for (const entry of list.getEntries() as any[]) {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                    }
                }
                metrics.cls = Math.round(clsValue * 1000) / 1000; // 3 decimal places
            });
            obs.observe({ type: 'layout-shift', buffered: true });
        } catch { /* not supported */ }
    }

    // ────────────────────────────────────
    //  Rage-Click Detection  (NEW)
    // ────────────────────────────────────

    private detectRageClick(e: MouseEvent): void {
        const target = e.target;
        if (!target) return;

        const now = Date.now();
        let timestamps = this.rageClickMap.get(target);

        if (!timestamps) {
            timestamps = [];
            this.rageClickMap.set(target, timestamps);
        }

        timestamps.push(now);

        // Prune old timestamps outside the window
        const cutoff = now - RAGE_CLICK_WINDOW;
        while (timestamps.length > 0 && timestamps[0] < cutoff) {
            timestamps.shift();
        }

        if (timestamps.length >= RAGE_CLICK_THRESHOLD) {
            const el = target as HTMLElement;
            this.queueEvent(this.createEvent('custom', {
                event: 'rage_click',
                x: e.clientX,
                y: e.clientY,
                tag: el.tagName?.toLowerCase(),
                id: el.id || undefined,
                className: typeof el.className === 'string'
                    ? el.className.slice(0, 100) || undefined
                    : undefined,
                text: this.sanitiseText(el.textContent),
                clickCount: timestamps.length,
            }));
            // Reset so we don't spam
            this.rageClickMap.set(target, []);
        }
    }

    // ────────────────────────────────────
    //  Session Recording  (NEW)
    // ────────────────────────────────────

    // Recordings are rrweb captures of the page itself (DOM snapshot + changes),
    // so the dashboard can replay what the visitor saw. The recorder is a
    // separate script, loaded only here, so sites without recording never pay
    // for it. Inputs are always masked; elements with class `tf-block` are left
    // out entirely and text inside `tf-mask` is masked.
    //
    // One recording spans the whole visit: its id is kept in sessionStorage and
    // the next page appends to it (rrweb takes a fresh snapshot per page), until
    // the session changes or recordingMaxDuration is reached.

    private recorderUrl(): string {
        return this.config.endpoint.replace(/\/api\/collect\/?$/, '') + '/recorder.js';
    }

    private loadRecorder(): Promise<RecordFn | null> {
        const loaded = (window as any).__TF_RRWEB__;
        if (loaded) return Promise.resolve(loaded.record);
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = this.recorderUrl();
            script.async = true;
            script.onload = () => resolve((window as any).__TF_RRWEB__?.record ?? null);
            script.onerror = () => resolve(null);
            document.head.appendChild(script);
        });
    }

    /** This visit's recording, if one was started on an earlier page and can go on. */
    private resumableRecording(): StoredRecording | null {
        try {
            const stored = JSON.parse(sessionStorage.getItem(REC_STORAGE_KEY) || 'null');
            if (
                stored && typeof stored.id === 'string' &&
                stored.sessionId === this.getSessionId() &&
                Date.now() - stored.startedAt < this.config.recordingMaxDuration
            ) {
                return stored;
            }
        } catch { /* storage blocked or corrupt */ }
        return null;
    }

    // Whether this visit is recorded. Decided once per session, so a visit is
    // recorded in full or not at all, at recordingSampleRate percent of visits.
    // A visit left out never loads the recorder or contacts the server.
    private inRecordingSample(): boolean {
        const sessionId = this.getSessionId();
        try {
            const stored = JSON.parse(sessionStorage.getItem(REC_SAMPLE_KEY) || 'null');
            if (stored && stored.sessionId === sessionId) return stored.record === true;
        } catch { /* storage blocked or corrupt */ }

        const record = Math.random() * 100 < this.config.recordingSampleRate;
        this.setRecordingSample(record);
        return record;
    }

    private setRecordingSample(record: boolean): void {
        try {
            sessionStorage.setItem(REC_SAMPLE_KEY, JSON.stringify({ sessionId: this.getSessionId(), record }));
        } catch { /* blocked: decided again on the next page */ }
    }

    // ── Visitor consent ──
    // Recording waits for the visitor's yes. The prompt says plainly what is and
    // isn't recorded; the answer is kept for REC_CONSENT_DAYS so it is asked once.
    // A site that collects consent itself turns the prompt off and calls
    // TF('consent', 'granted') (requireConsent mode); recording then follows that.

    private storedRecordingConsent(): 'granted' | 'denied' | null {
        try {
            const stored = JSON.parse(localStorage.getItem(REC_CONSENT_KEY) || 'null');
            if (stored && Date.now() - stored.at < REC_CONSENT_DAYS * 86_400_000) {
                return stored.answer === 'granted' ? 'granted' : 'denied';
            }
        } catch { /* storage blocked or corrupt */ }
        return null;
    }

    private askRecordingConsent(): Promise<boolean> {
        const stored = this.storedRecordingConsent();
        if (stored) return Promise.resolve(stored === 'granted');

        return new Promise((resolve) => {
            const host = document.createElement('div');
            const root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
            const site = window.location.hostname.replace(/^www\./, '');
            root.innerHTML = `
<style>
  .box { position: fixed; z-index: 2147483647; left: 16px; bottom: 16px; max-width: 360px;
    box-sizing: border-box; padding: 16px; border-radius: 10px; background: #111827; color: #f9fafb;
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 8px 30px rgba(0,0,0,.3); }
  @media (max-width: 420px) { .box { left: 8px; right: 8px; bottom: 8px; max-width: none; } }
  h2 { margin: 0 0 6px; font-size: 15px; }
  p { margin: 0 0 8px; }
  ul { margin: 0 0 10px; padding-left: 18px; }
  details { margin-bottom: 12px; color: #d1d5db; }
  summary { cursor: pointer; color: #f9fafb; }
  .row { display: flex; gap: 8px; }
  button { flex: 1; padding: 8px 12px; border-radius: 6px; font: inherit; cursor: pointer; }
  .yes { background: #f9fafb; color: #111827; border: 0; font-weight: 600; }
  .no { background: transparent; color: #f9fafb; border: 1px solid #4b5563; }
  button:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
</style>
<div class="box" role="dialog" aria-labelledby="tf-title" aria-describedby="tf-body">
  <h2 id="tf-title">Help improve ${site}</h2>
  <p id="tf-body">May we record how you use this visit — the pages you see, clicks and scrolling — to find what's confusing or broken?</p>
  <details>
    <summary>What's recorded?</summary>
    <ul>
      <li>Recorded: pages you view, mouse movement, clicks and scrolling.</li>
      <li>Never recorded: anything you type — including passwords, card numbers and messages.</li>
      <li>Used only by this site's owner to analyse and improve the site.</li>
      <li>Deleted automatically after the site's retention period.</li>
      <li>Saying no changes nothing; the site works the same.</li>
    </ul>
  </details>
  <div class="row">
    <button type="button" class="no">No thanks</button>
    <button type="button" class="yes">Allow</button>
  </div>
</div>`;
            const answer = (granted: boolean) => {
                try {
                    localStorage.setItem(REC_CONSENT_KEY, JSON.stringify({
                        answer: granted ? 'granted' : 'denied', at: Date.now(),
                    }));
                } catch { /* blocked: asked again next visit */ }
                host.remove();
                resolve(granted);
            };
            root.querySelector('.yes')!.addEventListener('click', () => answer(true));
            root.querySelector('.no')!.addEventListener('click', () => answer(false));
            document.body.appendChild(host);
        });
    }

    private async startRecording(): Promise<void> {
        if (this.recordingId || this.recordingStarting) return;
        // Global Privacy Control: the visitor has asked sites not to track them.
        if ((navigator as any).globalPrivacyControl === true) return;

        let current = this.resumableRecording();
        if (!current && !this.inRecordingSample()) return;
        this.recordingStarting = true;

        try {
            // The site's own consent (requireConsent + TF('consent', 'granted')) stands
            // in for the prompt. With the prompt off it is required: no visit is
            // recorded without one or the other.
            const siteConsented = this.config.requireConsent && this.consentGranted;
            if (!current && !siteConsented) {
                if (!this.config.recordingConsentPrompt) return;
                if (!(await this.askRecordingConsent())) return;
                if (!this.shouldTrack()) return;
            }

            const record = await this.loadRecorder();
            if (!record) return;

            if (!current) {
                const res = await fetch(`${this.config.endpoint}/${this.trackingId}/recording/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: this.getSessionId(),
                        url: window.location.href,
                    }),
                });
                if (!res.ok) {
                    // Refused (switched off, plan, or the site's daily limit):
                    // don't ask again on every page of this visit.
                    this.setRecordingSample(false);
                    return;
                }
                const data = await res.json();
                current = { id: data.id, sessionId: this.getSessionId(), startedAt: Date.now() };
                try {
                    sessionStorage.setItem(REC_STORAGE_KEY, JSON.stringify(current));
                } catch { /* blocked: this page is still recorded */ }
            }
            // Consent may have been withdrawn while the requests above were out.
            if (!this.shouldTrack()) return;

            this.recordingId = current.id;
            this.recordingStartTime = current.startedAt;
            this.recordingEvents = [];
            this.recordingBytes = 0;

            this.stopRecorder = record({
                emit: (event) => this.pushRecordingEvent(event),
                maskAllInputs: true,
                maskTextClass: 'tf-mask',
                blockClass: 'tf-block',
                ignoreClass: 'tf-ignore',
                slimDOMOptions: 'all',
                sampling: { mousemove: 50, scroll: 150, input: 'last', media: 800 },
            }) || null;

            this.recordingFlushTimer = window.setInterval(
                () => this.flushRecordingEvents(),
                REC_FLUSH_INTERVAL
            );
        } catch {
            /* silent — recording is best-effort */
        } finally {
            this.recordingStarting = false;
        }
    }

    private pushRecordingEvent(event: RecordedEvent): void {
        if (!this.recordingId) return;

        if (Date.now() - this.recordingStartTime > this.config.recordingMaxDuration) {
            this.endRecording();
            return;
        }

        this.recordingEvents.push(event);
        this.recordingBytes += JSON.stringify(event).length;

        // Send the page snapshot straight away, while a normal request can still
        // carry it: an unload beacon is capped at 64 KB and a snapshot is often more.
        if (event.type === RRWEB_FULL_SNAPSHOT || this.recordingBytes >= REC_FLUSH_BYTES) {
            setTimeout(() => this.flushRecordingEvents(), 0);
        }
    }

    // `final`: the page is being hidden or unloaded, so only beacons survive.
    // Each is kept under the beacon size limit; the server orders events by
    // timestamp, so beacons arriving out of order are fine.
    private flushRecordingEvents(final: boolean = false): void {
        if (!this.recordingId || this.recordingEvents.length === 0) return;

        const events = this.recordingEvents;
        this.recordingEvents = [];
        this.recordingBytes = 0;

        const url = `${this.config.endpoint}/${this.trackingId}/recording/${this.recordingId}/events`;
        if (final) {
            let batch: RecordedEvent[] = [];
            let size = 0;
            for (const event of events) {
                const eventSize = JSON.stringify(event).length;
                if (batch.length && size + eventSize > BEACON_MAX_BYTES) {
                    beacon(url, { format: 'rrweb', events: batch });
                    batch = [];
                    size = 0;
                }
                batch.push(event);
                size += eventSize;
            }
            beacon(url, { format: 'rrweb', events: batch });
            return;
        }

        const body = JSON.stringify({ format: 'rrweb', events });
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            // keepalive requests are capped at 64 KB in total.
            keepalive: body.length < BEACON_MAX_BYTES,
        }).catch(() => {});
    }

    private endRecording(): void {
        if (!this.recordingId) return;

        if (this.stopRecorder) {
            this.stopRecorder();
            this.stopRecorder = null;
        }
        this.flushRecordingEvents(true);

        if (this.recordingFlushTimer) {
            clearInterval(this.recordingFlushTimer);
            this.recordingFlushTimer = null;
        }

        beacon(`${this.config.endpoint}/${this.trackingId}/recording/${this.recordingId}/end`, {});

        this.recordingId = null;
        try {
            sessionStorage.removeItem(REC_STORAGE_KEY);
        } catch { /* blocked */ }
    }

    // ────────────────────────────────────
    //  Listener setup
    // ────────────────────────────────────

    private setupListeners(): void {
        // Click tracking (checked per click, so the dashboard can switch it off)
        document.addEventListener('click', (e) => this.trackClick(e), { passive: true });

        // Scroll tracking (throttled)
        let scrollTimeout: number;
        window.addEventListener('scroll', () => {
            if (scrollTimeout) return;
            scrollTimeout = window.setTimeout(() => {
                this.trackScroll();
                scrollTimeout = 0;
            }, 100);
        }, { passive: true });

        // Form tracking
        document.addEventListener('submit', (e) => this.trackFormSubmit(e), { passive: true });

        // Error tracking
        if (this.config.trackErrors) {
            this.setupErrorTracking();
        }

        // Performance tracking
        if (this.config.trackPerformance) {
            this.setupPerformanceTracking();
        }

        // Flush on page unload; report how long the page was visible for.
        // session_end rides the same beacon batch as the queued events.
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.queueEvent(this.createEvent('session_end', {
                    duration: Math.round((Date.now() - this.pageStart) / 1000),
                    lastPage: window.location.href,
                }));
                this.flush(true);
                // Save what has been recorded, but keep recording: the visitor
                // may only have switched tabs. Ending here used to cut every
                // recording at the first tab switch, with no new one on return.
                this.flushRecordingEvents(true);
            } else {
                this.pageStart = Date.now();
            }
        });

        // The page is really going away (navigation, close, or into bfcache).
        // The recording is not ended: the next page of the visit carries it on.
        window.addEventListener('pagehide', () => {
            this.flush(true);
            this.flushRecordingEvents(true);
        });

        // Track SPA navigation
        const pushState = history.pushState;
        history.pushState = (...args) => {
            pushState.apply(history, args);
            this.scrollDepth = 0;
            this.trackPageView();
        };
        const replaceState = history.replaceState;
        history.replaceState = (...args) => {
            replaceState.apply(history, args);
            this.scrollDepth = 0;
            this.trackPageView();
        };

        window.addEventListener('popstate', () => {
            this.scrollDepth = 0;
            this.trackPageView();
        });
    }

    // ────────────────────────────────────
    //  Public API
    // ────────────────────────────────────

    public isInitialized(): boolean {
        return this.initialized;
    }

    public init(config?: Partial<TFConfig>, trackingIdOverride?: string): void {
        if (this.initialized) {
            // Late init (e.g. TF('init', {...}) after auto-init): merge the new
            // config and start recording if it was just switched on.
            this.pageConfig = { ...this.pageConfig, ...(config || {}) };
            this.config = { ...this.config, ...(config || {}) };
            if (this.config.trackRecordings && !this.recordingId && this.shouldTrack()) {
                this.startRecording();
            }
            return;
        }

        // Tracking ID: explicit argument, else window.__TF_ID__ (the install
        // snippet's data-tracking-id is resolved by the bootstrap below).
        this.trackingId = trackingIdOverride || (window as any).__TF_ID__ || '';

        if (!this.trackingId) {
            console.warn(
                '[Thravic] No tracking ID found. Add data-tracking-id to the ' +
                'script tag or set window.__TF_ID__ before loading the tracker.'
            );
            return;
        }

        // Defaults <- window.__TF_CONFIG__ <- explicit config (last wins). The
        // dashboard settings fetched below slot in between the defaults and these.
        this.pageConfig = {
            ...(((window as any).__TF_CONFIG__ as Partial<TFConfig>) || {}),
            ...(config || {}),
        };
        this.config = { ...defaultConfig, ...this.pageConfig };

        // If consent mode is on and consent has not yet been granted,
        // we still set up listeners but will not send anything until grantConsent() is called.
        if (this.config.requireConsent) {
            // Check if consent was already stored in a previous session
            try {
                if (localStorage.getItem('_tf_consent') === 'granted') {
                    this.consentGranted = true;
                }
            } catch { /* storage blocked */ }
        } else {
            this.consentGranted = true;
        }

        this.initialized = true;

        // Deliver anything a previous page could not. Safe to re-send: the server
        // dedupes on `eventId`.
        this.loadPersistedQueue();

        // Setup listeners
        this.setupListeners();

        // Start batch timer
        this.batchTimer = window.setInterval(() => this.flush(), this.config.batchInterval);

        // Track initial page view (noop if consent not yet granted)
        this.trackPageView();

        // Start session recording if enabled
        if (this.config.trackRecordings && this.shouldTrack()) {
            this.startRecording();
        }

        this.loadRemoteConfig();
    }

    // Apply the domain's dashboard settings. Anything the page set itself wins;
    // the server enforces the same switches whatever the client does, so a failed
    // fetch only means the defaults stay in effect.
    private async loadRemoteConfig(): Promise<void> {
        try {
            const res = await fetch(`${this.config.endpoint}/${this.trackingId}/config`);
            if (!res.ok) return;
            const remote = await res.json() as Partial<TFConfig>;
            for (const key of REMOTE_CONFIG_KEYS) {
                if (typeof remote[key] === 'boolean' && !(key in this.pageConfig)) {
                    this.config[key] = remote[key] as boolean;
                }
            }
            for (const key of REMOTE_CONFIG_NUMBERS) {
                if (typeof remote[key] === 'number' && !(key in this.pageConfig)) {
                    this.config[key] = remote[key] as number;
                }
            }
            if (this.config.trackRecordings && !this.recordingId && this.shouldTrack()) {
                this.startRecording();
            }
        } catch { /* offline or blocked: keep the defaults */ }
    }

    // Manual event tracking
    public track(eventName: string, data?: Record<string, unknown>): void {
        this.queueEvent(this.createEvent('custom', { event: eventName, ...data }));
    }

    // Identify user (for logged-in users)
    // NOTE: Linking behaviour to a real userId is GDPR-sensitive.
    // Only call this after the user has been informed and consented.
    public identify(userId: string, traits?: Record<string, unknown>): void {
        this.queueEvent(this.createEvent('custom', {
            event: 'identify',
            userId,
            ...traits
        }));
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Bootstrap — runs after this script loads.
//
// The install snippet is:
//   <script async src=".../tf.js" data-tracking-id="TRACKING_ID"></script>
//
// The tracking id is resolved from, in order: window.__TF_ID__, a
// window.TF.id set before this script loaded, the data-tracking-id attribute
// on this script tag, then any script tag carrying that attribute
// (document.currentScript is null for async scripts, so the querySelector is
// the live path for the standard snippet).
//
// Optional advanced configuration: window.__TF_CONFIG__ (merged over the
// defaults; enabling trackRecordings there is the supported way to switch
// session recordings on). Calls queued in window.__TF_Q__ are replayed before
// auto-init, so nothing is lost.
// ──────────────────────────────────────────────────────────────────────────

// Bot / crawler filter (same guard as the previous tracker), plus a
// double-load guard that also covers embedding both /tf.js and /v.js.
if (!navigator.webdriver && !(window as any).__TF_LOADED__) {
    (window as any).__TF_LOADED__ = true;

    // Preserve the previous tracker's window.TF.id contract before overwriting.
    const priorTF = (window as any).TF as { id?: string } | undefined;
    const priorId = priorTF && typeof priorTF.id === 'string' ? priorTF.id : '';

    // Create singleton instance
    const tf = new ThravicAnalytics();

    // Capture queued calls BEFORE overwriting the global (order matters)
    const priorQueue: unknown[][] = (window as any).__TF_Q__ || [];

    function resolveTrackingId(): string {
        if ((window as any).__TF_ID__) return (window as any).__TF_ID__;
        if (priorId) return priorId;
        const tag = document.currentScript
            || document.querySelector('script[data-tracking-id]');
        return (tag && tag.getAttribute('data-tracking-id')) || '';
    }

    // Expose global API function
    function dispatchTF(...args: unknown[]): void {
        const method = args[0] as string;
        if (method === 'init') {
            tf.init(args[1] as Partial<TFConfig>, resolveTrackingId());
        } else if (method === 'track') {
            tf.track(args[1] as string, args[2] as Record<string, unknown>);
        } else if (method === 'identify') {
            tf.identify(args[1] as string, args[2] as Record<string, unknown>);
        } else if (method === 'consent') {
            const action = args[1] as string;
            if (action === 'granted') {
                try { localStorage.setItem('_tf_consent', 'granted'); } catch { /* blocked */ }
                tf.grantConsent();
            } else if (action === 'denied') {
                try { localStorage.removeItem('_tf_consent'); } catch { /* blocked */ }
                tf.revokeConsent();
            }
        } else if (method === 'revokeRecordingConsent') {
            // For a "stop recording me" link on the site's privacy page.
            tf.revokeRecordingConsent();
        }
    }

    (window as any).TF = dispatchTF;

    // Replay any calls that were queued before the script loaded
    for (const call of priorQueue) {
        dispatchTF(...call);
    }

    // Auto-start when the snippet supplied a tracking id and no explicit init ran
    if (!tf.isInitialized()) {
        const autoId = resolveTrackingId();
        if (autoId) tf.init(undefined, autoId);
    }
}
