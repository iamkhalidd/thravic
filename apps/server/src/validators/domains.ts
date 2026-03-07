// ──────────────────────────────────────────────
// Thravic — Domain Validators
// ──────────────────────────────────────────────
import { z } from 'zod';

export const createDomainSchema = z.object({
    domain: z
        .string()
        .min(3, 'Domain must be at least 3 characters')
        .regex(
            /^[a-zA-Z0-9][a-zA-Z0-9-_.]+[a-zA-Z0-9]$/,
            'Invalid domain format'
        ),
    name: z.string().min(1).optional(),
});

export const updateSettingsSchema = z.object({
    trackClicks: z.boolean().optional(),
    trackScrolls: z.boolean().optional(),
    trackForms: z.boolean().optional(),
    sessionRecording: z.boolean().optional(),
    heatmaps: z.boolean().optional(),
});
