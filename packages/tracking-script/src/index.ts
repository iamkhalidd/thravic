/**
 * TrackFlow Analytics - Lightweight Tracking Script
 * 
 * Features:
 * - Page view tracking
 * - Click tracking
 * - Scroll depth tracking
 * - UTM parameter capture
 * - Session management
 * - Batch event sending
 * - Privacy-respecting (no fingerprinting)
 */

interface TFConfig {
    endpoint: string;
    batchSize: number;
    batchInterval: number;
    trackClicks: boolean;
    trackScrolls: boolean;
    respectDoNotTrack: boolean;
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
    endpoint: 'http://localhost:3001/api/collect',
    batchSize: 10,
    batchInterval: 5000,
    trackClicks: true,
    trackScrolls: true,
    respectDoNotTrack: true
};

class TrackFlowAnalytics {
    private trackingId: string = '';
    private config: TFConfig = defaultConfig;
    private eventQueue: TFEvent[] = [];
    private batchTimer: number | null = null;
    private scrollDepth: number = 0;
    private initialized: boolean = false;

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

    // Check Do Not Track
    private shouldTrack(): boolean {
        if (this.config.respectDoNotTrack) {
            const dnt = navigator.doNotTrack || (window as any).doNotTrack;
            if (dnt === '1' || dnt === 'yes') {
                return false;
            }
        }
        return true;
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

        const events = [...this.eventQueue];
        this.eventQueue = [];

        const payload = {
            trackingId: this.trackingId,
            events
        };

        // Use sendBeacon for reliable delivery
        if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon(`${this.config.endpoint}/beacon`, blob);
        } else {
            // Fallback to fetch
            fetch(this.config.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            }).catch(() => { });
        }
    }

    // Track page view
    private trackPageView(): void {
        this.queueEvent(this.createEvent('pageview'));
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
            className: target.className || undefined,
            text: target.textContent?.slice(0, 100) || undefined
        };

        // Track if it's a link
        const link = target.closest('a');
        if (link) {
            data.href = link.href;
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

        // Get tracking ID from global
        this.trackingId = (window as any).TF?.id || '';

        if (!this.trackingId) {
            console.warn('[TrackFlow] No tracking ID found');
            return;
        }

        this.config = { ...defaultConfig, ...config };
        this.initialized = true;

        // Setup listeners
        this.setupListeners();

        // Start batch timer
        this.batchTimer = window.setInterval(() => this.flush(), this.config.batchInterval);

        // Track initial page view
        this.trackPageView();

        console.log('[TrackFlow] Initialized with ID:', this.trackingId);
    }

    // Manual event tracking
    public track(eventName: string, data?: Record<string, unknown>): void {
        this.queueEvent(this.createEvent('custom', { event: eventName, ...data }));
    }

    // Identify user (for logged-in users)
    public identify(userId: string, traits?: Record<string, unknown>): void {
        this.queueEvent(this.createEvent('custom', {
            event: 'identify',
            userId,
            ...traits
        }));
    }
}

// Create singleton instance
const tf = new TrackFlowAnalytics();

// Global API
(window as any).TF = function (...args: unknown[]) {
    const method = args[0] as string;

    if (method === 'init') {
        tf.init(args[1] as Partial<TFConfig>);
    } else if (method === 'track') {
        tf.track(args[1] as string, args[2] as Record<string, unknown>);
    } else if (method === 'identify') {
        tf.identify(args[1] as string, args[2] as Record<string, unknown>);
    }
};

// Preserve tracking ID and queue
const existingTF = (window as any).TF;
if (existingTF && existingTF.id) {
    (window as any).TF.id = existingTF.id;
}
if (existingTF && existingTF.q) {
    // Process queued calls
    for (const call of existingTF.q) {
        (window as any).TF(...call);
    }
}

export default tf;
