import { recordingEventSchema, appendEventsSchema, startRecordingSchema } from '../recordings';

const validRecordingEvent = {
    type: 'click' as const,
    timestamp: Date.now(),
    data: { x: 100, y: 200 },
};

describe('Recording Validators', () => {
    describe('recordingEventSchema', () => {
        it('validates a valid recording event', () => {
            const result = recordingEventSchema.safeParse(validRecordingEvent);
            expect(result.success).toBe(true);
        });

        it('validates all recording event types', () => {
            const types = ['mousemove', 'click', 'scroll', 'input', 'resize', 'pageview'] as const;
            types.forEach(type => {
                const result = recordingEventSchema.safeParse({ ...validRecordingEvent, type });
                expect(result.success).toBe(true);
            });
        });

        it('fails on invalid event type', () => {
            const result = recordingEventSchema.safeParse({
                ...validRecordingEvent,
                type: 'hover',
            });
            expect(result.success).toBe(false);
        });

        it('fails when timestamp is missing', () => {
            const { timestamp, ...noTimestamp } = validRecordingEvent;
            const result = recordingEventSchema.safeParse(noTimestamp);
            expect(result.success).toBe(false);
        });

        it('fails when data is missing', () => {
            const { data, ...noData } = validRecordingEvent;
            const result = recordingEventSchema.safeParse(noData);
            expect(result.success).toBe(false);
        });
    });

    describe('appendEventsSchema', () => {
        it('validates a batch with one event', () => {
            const result = appendEventsSchema.safeParse({
                events: [validRecordingEvent],
            });
            expect(result.success).toBe(true);
        });

        it('fails on empty events array', () => {
            const result = appendEventsSchema.safeParse({ events: [] });
            expect(result.success).toBe(false);
        });

        it('fails when exceeding 500 events', () => {
            const result = appendEventsSchema.safeParse({
                events: Array(501).fill(validRecordingEvent),
            });
            expect(result.success).toBe(false);
        });
    });

    describe('startRecordingSchema', () => {
        it('validates a valid start recording payload', () => {
            const result = startRecordingSchema.safeParse({
                url: 'https://example.com/page',
            });
            expect(result.success).toBe(true);
        });

        it('validates with optional sessionId', () => {
            const result = startRecordingSchema.safeParse({
                url: 'https://example.com/page',
                sessionId: 'session-123',
            });
            expect(result.success).toBe(true);
        });

        it('fails on invalid URL', () => {
            const result = startRecordingSchema.safeParse({
                url: 'not-a-url',
            });
            expect(result.success).toBe(false);
        });

        it('fails when URL is missing', () => {
            const result = startRecordingSchema.safeParse({});
            expect(result.success).toBe(false);
        });
    });
});
