// ──────────────────────────────────────────────
// Thravic — Recording Validators
// ──────────────────────────────────────────────
import { z } from 'zod';

export const recordingEventSchema = z.object({
    type: z.enum(['mousemove', 'click', 'scroll', 'input', 'resize', 'pageview']),
    timestamp: z.number(),
    data: z.record(z.any()),
});

export const appendEventsSchema = z.object({
    events: z
        .array(recordingEventSchema)
        .min(1, 'At least one event required')
        .max(500, 'Maximum 500 events per batch'),
});

export const startRecordingSchema = z.object({
    sessionId: z.string().optional(),
    url: z.string().url('Invalid URL'),
});
