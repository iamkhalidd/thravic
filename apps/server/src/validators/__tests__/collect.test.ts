import { eventSchema, batchSchema } from '../collect';

const validEvent = {
    type: 'pageview' as const,
    url: 'https://example.com/page',
    visitorId: 'visitor-abc-123',
    sessionId: 'session-xyz-789',
};

describe('Collect Validators', () => {
    describe('eventSchema', () => {
        it('validates a minimal valid event', () => {
            const result = eventSchema.safeParse(validEvent);
            expect(result.success).toBe(true);
        });

        it('validates all event types', () => {
            const types = ['pageview', 'click', 'scroll', 'form', 'custom'] as const;
            types.forEach(type => {
                const result = eventSchema.safeParse({ ...validEvent, type });
                expect(result.success).toBe(true);
            });
        });

        it('validates event with all optional UTM fields', () => {
            const result = eventSchema.safeParse({
                ...validEvent,
                referrer: 'https://google.com',
                utmSource: 'google',
                utmMedium: 'cpc',
                utmCampaign: 'spring_sale',
                utmTerm: 'analytics',
                utmContent: 'banner_ad',
                screenWidth: 1920,
                screenHeight: 1080,
                language: 'en-US',
                data: { buttonId: 'cta-main' },
            });
            expect(result.success).toBe(true);
        });

        it('fails on invalid event type', () => {
            const result = eventSchema.safeParse({ ...validEvent, type: 'invalid' });
            expect(result.success).toBe(false);
        });

        it('fails on invalid URL', () => {
            const result = eventSchema.safeParse({ ...validEvent, url: 'not-a-url' });
            expect(result.success).toBe(false);
        });

        it('fails when visitorId is missing', () => {
            const { visitorId, ...noVisitor } = validEvent;
            const result = eventSchema.safeParse(noVisitor);
            expect(result.success).toBe(false);
        });

        it('fails when sessionId is missing', () => {
            const { sessionId, ...noSession } = validEvent;
            const result = eventSchema.safeParse(noSession);
            expect(result.success).toBe(false);
        });

        it('fails on empty visitorId', () => {
            const result = eventSchema.safeParse({ ...validEvent, visitorId: '' });
            expect(result.success).toBe(false);
        });
    });

    describe('batchSchema', () => {
        it('validates a batch with one event', () => {
            const result = batchSchema.safeParse({ events: [validEvent] });
            expect(result.success).toBe(true);
        });

        it('validates a batch with multiple events', () => {
            const result = batchSchema.safeParse({
                events: Array(10).fill(validEvent),
            });
            expect(result.success).toBe(true);
        });

        it('fails on empty events array', () => {
            const result = batchSchema.safeParse({ events: [] });
            expect(result.success).toBe(false);
        });

        it('fails when exceeding 50 events', () => {
            const result = batchSchema.safeParse({
                events: Array(51).fill(validEvent),
            });
            expect(result.success).toBe(false);
        });
    });
});
