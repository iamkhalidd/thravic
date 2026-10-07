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
 * - Session recording capture (mouse moves, clicks, scrolls, inputs, resizes)
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
    /** Capture session recordings (mouse, input, scroll, resize). Default: false — opt-in, heavier */
    trackRecordings: boolean;
    /** Maximum recording duration in ms. Default: 600 000 (10 min) */
    recordingMaxDuration: number;
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

// ── Recording event shape (sent to /recording/:id/events) ──
interface RecordingEvent {
    type: 'mousemove' | 'click' | 'scroll' | 'input' | 'resize' | 'pageview';
    timestamp: number;
    data: Record<string, unknown>;
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
};

const SCROLL_MILESTONES = [25, 50, 75, 100];

// Settings the dashboard controls (GET {endpoint}/{trackingId}/config).
const REMOTE_CONFIG_KEYS = ['trackClicks', 'trackScrolls', 'trackForms', 'trackRecordings'] as const;

// ── Rage-click constants ──
const RAGE_CLICK_THRESHOLD = 3;      // clicks needed
const RAGE_CLICK_WINDOW   = 800;     // ms

// ── Recording constants ──
const REC_MOUSEMOVE_THROTTLE = 50;   // ms between mousemove captures
const REC_FLUSH_INTERVAL     = 3000; // ms between recording event flushes
const REC_FLUSH_SIZE          = 100;  // max events before auto-flush

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
    private recordingEvents: RecordingEvent[] = [];
    private recordingStartTime: number = 0;
    private recordingFlushTimer: number | null = null;
    private lastMoveTs: number = 0;

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
    }

    // Revoke consent (e.g. user withdraws permission)
    public revokeConsent(): void {
        this.consentGranted = false;
        // Clear any queued events, including the persisted copy.
        this.eventQueue = [];
        this.persistQueue();
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

        if (final && navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify({ events })], { type: 'application/json' });
            navigator.sendBeacon(batchUrl, blob);
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

        let actionPath: string | undefined;
        try {
            const url = new URL(form.action, window.location.origin);
            actionPath = url.pathname;
        } catch {
            actionPath = form.getAttribute('action') || undefined;
        }

        const data: Record<string, unknown> = {
            formId: form.id || undefined,
            formName: form.name || undefined,
            action: actionPath,
            method: (form.method || 'get').toUpperCase(),
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

    private async startRecording(): Promise<void> {
        if (this.recordingId) return; // already recording

        try {
            const url = `${this.config.endpoint}/${this.trackingId}/recording/start`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.getSessionId(),
                    url: window.location.href,
                }),
            });

            if (!res.ok) return;

            const data = await res.json();
            this.recordingId = data.id;
            this.recordingStartTime = Date.now();
            this.recordingEvents = [];

            // Push initial pageview recording event
            this.pushRecordingEvent('pageview', {
                url: window.location.href,
                screenWidth: window.screen.width,
                screenHeight: window.screen.height,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
            });

            // Set up recording-specific listeners
            this.setupRecordingListeners();

            // Set up periodic flush
            this.recordingFlushTimer = window.setInterval(
                () => this.flushRecordingEvents(),
                REC_FLUSH_INTERVAL
            );
        } catch {
            /* silent — recording is best-effort */
        }
    }

    private pushRecordingEvent(type: RecordingEvent['type'], data: Record<string, unknown>): void {
        if (!this.recordingId) return;

        // Enforce max recording duration
        if (Date.now() - this.recordingStartTime > this.config.recordingMaxDuration) {
            this.endRecording();
            return;
        }

        this.recordingEvents.push({
            type,
            timestamp: Date.now() - this.recordingStartTime,
            data,
        });

        if (this.recordingEvents.length >= REC_FLUSH_SIZE) {
            this.flushRecordingEvents();
        }
    }

    private flushRecordingEvents(): void {
        if (!this.recordingId || this.recordingEvents.length === 0) return;

        const events = [...this.recordingEvents];
        this.recordingEvents = [];

        const url = `${this.config.endpoint}/${this.trackingId}/recording/${this.recordingId}/events`;
        const payload = { events };

        if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            const sent = navigator.sendBeacon(url, blob);
            if (!sent) {
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    keepalive: true,
                }).catch(() => {});
            }
        } else {
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true,
            }).catch(() => {});
        }
    }

    private endRecording(): void {
        if (!this.recordingId) return;

        // Flush remaining events first
        this.flushRecordingEvents();

        // Clear the periodic flush timer
        if (this.recordingFlushTimer) {
            clearInterval(this.recordingFlushTimer);
            this.recordingFlushTimer = null;
        }

        const url = `${this.config.endpoint}/${this.trackingId}/recording/${this.recordingId}/end`;
        if (navigator.sendBeacon) {
            navigator.sendBeacon(url, new Blob([JSON.stringify({})], { type: 'application/json' }));
        } else {
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
                keepalive: true,
            }).catch(() => {});
        }

        this.recordingId = null;
    }

    private setupRecordingListeners(): void {
        // ── Mouse move (throttled) ──
        document.addEventListener('mousemove', (e: MouseEvent) => {
            const now = Date.now();
            if (now - this.lastMoveTs < REC_MOUSEMOVE_THROTTLE) return;
            this.lastMoveTs = now;

            this.pushRecordingEvent('mousemove', {
                x: e.clientX,
                y: e.clientY,
            });
        }, { passive: true });

        // ── Clicks ──
        document.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            this.pushRecordingEvent('click', {
                x: e.clientX,
                y: e.clientY,
                tag: target?.tagName?.toLowerCase(),
                id: target?.id || undefined,
            });
        }, { passive: true });

        // ── Scroll ──
        let recScrollTimeout: number;
        window.addEventListener('scroll', () => {
            if (recScrollTimeout) return;
            recScrollTimeout = window.setTimeout(() => {
                this.pushRecordingEvent('scroll', {
                    scrollX: window.scrollX,
                    scrollY: window.scrollY,
                });
                recScrollTimeout = 0;
            }, 100);
        }, { passive: true });

        // ── Input changes (capture value length only, NOT the actual value, for privacy) ──
        document.addEventListener('input', (e: Event) => {
            const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            if (!target) return;
            this.pushRecordingEvent('input', {
                tag: target.tagName?.toLowerCase(),
                inputType: (target as HTMLInputElement).type || undefined,
                id: target.id || undefined,
                name: target.name || undefined,
                valueLength: target.value?.length ?? 0,
            });
        }, { passive: true });

        // ── Resize ──
        let recResizeTimeout: number;
        window.addEventListener('resize', () => {
            if (recResizeTimeout) return;
            recResizeTimeout = window.setTimeout(() => {
                this.pushRecordingEvent('resize', {
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight,
                });
                recResizeTimeout = 0;
            }, 200);
        }, { passive: true });
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
                if (this.recordingId) {
                    this.endRecording();
                }
            } else {
                this.pageStart = Date.now();
            }
        });

        window.addEventListener('beforeunload', () => {
            this.flush(true);
            if (this.recordingId) {
                this.endRecording();
            }
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
