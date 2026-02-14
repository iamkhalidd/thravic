// ──────────────────────────────────────────────
// TrackFlow — Collect (Event) Validators
// ──────────────────────────────────────────────
import { z } from 'zod';

export const eventSchema = z.object({
    type: z.enum(['pageview', 'click', 'scroll', 'form', 'custom']),
    url: z.string().url('Invalid URL'),
    referrer: z.string().optional(),
    visitorId: z.string().min(1, 'Visitor ID is required'),
    sessionId: z.string().min(1, 'Session ID is required'),
    utmSource: z.string().optional(),
    utmMedium: z.string().optional(),
    utmCampaign: z.string().optional(),
    utmTerm: z.string().optional(),
    utmContent: z.string().optional(),
    screenWidth: z.number().optional(),
    screenHeight: z.number().optional(),
    language: z.string().optional(),
    data: z.record(z.unknown()).optional(),
});

export const batchSchema = z.object({
    events: z.array(eventSchema).min(1, 'At least one event required').max(50, 'Maximum 50 events per batch'),
});
