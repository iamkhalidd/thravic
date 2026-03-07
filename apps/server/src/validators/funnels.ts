// ──────────────────────────────────────────────
// Thravic — Funnel Validators
// ──────────────────────────────────────────────
import { z } from 'zod';

export const stepSchema = z.object({
    name: z.string().min(1, 'Step name is required'),
    type: z.enum(['pageview', 'click', 'custom']),
    matchType: z.enum(['exact', 'contains', 'regex']).default('contains'),
    matchValue: z.string().min(1, 'Match value is required'),
});

export const createFunnelSchema = z.object({
    name: z.string().min(1, 'Funnel name is required'),
    description: z.string().optional().default(''),
    steps: z
        .array(stepSchema)
        .min(2, 'A funnel needs at least 2 steps')
        .max(10, 'Maximum 10 steps per funnel'),
});

export const updateFunnelSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    steps: z
        .array(stepSchema)
        .min(2, 'A funnel needs at least 2 steps')
        .max(10, 'Maximum 10 steps per funnel')
        .optional(),
});
