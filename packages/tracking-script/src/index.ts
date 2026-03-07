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
}

interface TFEvent {
    type: 'pageview' | 'click' | 'scroll' | 'form' | 'custom';
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

// Storage keys
const VISITOR_KEY = '_tf_vid';
const SESSION_KEY = '_tf_sid';
const SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes

// Default configuration
const defaultConfig: TFConfig = {
    endpoint: 'https://api.thravic.app/api/collect',
    batchSize: 10,
    batchInterval: 5000,
    trackClicks: true,
    trackScrolls: true,
    respectDoNotTrack: true,
    requireConsent: false,
    clickTextMaxLength: 50,
};

class ThravicAnalytics {
    private trackingId: string = '';
    private config: TFConfig = defaultConfig;
    private eventQueue: TFEvent[] = [];
    private batchTimer: number | null = null;
    private scrollDepth: number = 0;
    private initialized: boolean = false;
    /** When requireConsent=true, tracking is paused until consent is granted */
    private consentGranted: boolean = false;

    // Generate a random ID
    private generateId(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    // Get or create visitor ID
    private getVisitorId(): string {
        let visitorId = localStorage.getItem(VISITOR_KEY);
        if (!visitorId) {
            visitorId = this.generateId();
            localStorage.setItem(VISITOR_KEY, visitorId);
        }
        return visitorId;
    }

    // Get or create session ID
    private getSessionId(): string {
        const stored = sessionStorage.getItem(SESSION_KEY);
        if (stored) {
            const { id, expiry } = JSON.parse(stored);
            if (Date.now() < expiry) {
                // Refresh session
                sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                    id,
                    expiry: Date.now() + SESSION_EXPIRY
                }));
                return id;
            }
        }

        // Create new session
        const sessionId = this.generateId();
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            id: sessionId,
            expiry: Date.now() + SESSION_EXPIRY
        }));
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
        // Clear any queued events
        this.eventQueue = [];
    }

    // Create base event object
    private createEvent(type: TFEvent['type'], data?: Record<string, unknown>): TFEvent {
        const utm = this.getUtmParams();
        return {
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

    // Queue an event
    private queueEvent(event: TFEvent): void {
        if (!this.shouldTrack()) return;

        this.eventQueue.push(event);

        if (this.eventQueue.length >= this.config.batchSize) {
            this.flush();
        }
    }

    // Send events to server
    private flush(): void {
        if (this.eventQueue.length === 0) return;
        if (!this.shouldTrack()) return;

        const events = [...this.eventQueue];
        this.eventQueue = [];

        // Batch endpoint: POST /api/collect/:trackingId/batch
        const batchUrl = `${this.config.endpoint}/${this.trackingId}/batch`;
        const payload = { events };

        // Use sendBeacon for reliable delivery on page unload
        if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            const sent = navigator.sendBeacon(batchUrl, blob);
            if (!sent) {
                // sendBeacon queue is full — fall through to fetch
                this.flushWithFetch(batchUrl, payload);
            }
        } else {
            this.flushWithFetch(batchUrl, payload);
        }
    }

    private flushWithFetch(url: string, payload: object): void {
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
        }).catch(() => { /* silent — best-effort delivery */ });
    }

    // Track page view
    private trackPageView(): void {
        this.queueEvent(this.createEvent('pageview'));
    }

    // Sanitise element text — strips whitespace and caps length to avoid PII capture
    private sanitiseText(raw: string | null | undefined): string | undefined {
        if (!raw) return undefined;
        const maxLen = this.config.clickTextMaxLength;
        if (maxLen <= 0) return undefined; // text capture disabled
        const cleaned = raw.replace(/\s+/g, ' ').trim();
        return cleaned.slice(0, maxLen) || undefined;
    }

    // Track click
    private trackClick(e: MouseEvent): void {
        const target = e.target as HTMLElement;
        if (!target) return;

        const data: Record<string, unknown> = {
            x: e.clientX,
            y: e.clientY,
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

    // Track scroll depth
    private trackScroll(): void {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = Math.round((scrollTop / docHeight) * 100);

        // Only track at 25% increments
        if (scrollPercent > this.scrollDepth && scrollPercent % 25 === 0) {
            this.scrollDepth = scrollPercent;
            this.queueEvent(this.createEvent('scroll', { depth: scrollPercent }));
        }
    }

    // Setup event listeners
    private setupListeners(): void {
        // Click tracking
        if (this.config.trackClicks) {
            document.addEventListener('click', (e) => this.trackClick(e), { passive: true });
        }

        // Scroll tracking (throttled)
        if (this.config.trackScrolls) {
            let scrollTimeout: number;
            window.addEventListener('scroll', () => {
                if (scrollTimeout) return;
                scrollTimeout = window.setTimeout(() => {
                    this.trackScroll();
                    scrollTimeout = 0;
                }, 100);
            }, { passive: true });
        }

        // Flush on page unload
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.flush();
            }
        });

        window.addEventListener('beforeunload', () => {
            this.flush();
        });

        // Track SPA navigation
        const pushState = history.pushState;
        history.pushState = (...args) => {
            pushState.apply(history, args);
            this.scrollDepth = 0;
            this.trackPageView();
        };

        window.addEventListener('popstate', () => {
            this.scrollDepth = 0;
            this.trackPageView();
        });
    }

    // Public API
    public init(config?: Partial<TFConfig>): void {
        if (this.initialized) return;

        // Get tracking ID — set by the embed snippet (window.TF.id)
        this.trackingId = (window as any).__TF_ID__ || '';

        if (!this.trackingId) {
            // Silent in production; uncomment below during local debugging only:
            // console.warn('[Thravic] No tracking ID found. Did you set window.__TF_ID__?');
            return;
        }

        this.config = { ...defaultConfig, ...config };

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

        // Setup listeners
        this.setupListeners();

        // Start batch timer
        this.batchTimer = window.setInterval(() => this.flush(), this.config.batchInterval);

        // Track initial page view (noop if consent not yet granted)
        this.trackPageView();
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
// Bootstrap — runs after this script loads
// The embed snippet sets window.__TF_ID__ and window.__TF_Q__ (queued calls)
// before this script loads so nothing is lost.
// ──────────────────────────────────────────────────────────────────────────

// Create singleton instance
const tf = new ThravicAnalytics();

// Capture queued calls BEFORE overwriting the global (order matters)
const _priorQueue: unknown[][] = (window as any).__TF_Q__ || [];

// Expose global API function
function dispatchTF(...args: unknown[]): void {
    const method = args[0] as string;
    if (method === 'init') {
        tf.init(args[1] as Partial<TFConfig>);
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
for (const call of _priorQueue) {
    dispatchTF(...call);
}

export default tf;
