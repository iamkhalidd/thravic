// ──────────────────────────────────────────────
// Thravic — Admin Validators
// Zod schemas for all admin mutation endpoints
// ──────────────────────────────────────────────
import { z } from 'zod';

// ── User Management ─────────────────────────
export const updateUserSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    email: z.string().email().optional(),
    subscription: z.enum(['free', 'pro', 'agency']).optional(),
    role: z.enum(['user', 'admin', 'super_admin']).optional(),
});

export const adminResetPasswordSchema = z.object({
    newPassword: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password too long'),
});

// ── Domain Management ───────────────────────
export const updateAdminDomainSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    verified: z.boolean().optional(),
});

export const transferDomainSchema = z.object({
    newUserId: z.string().uuid('Invalid user ID'),
});

// ── Subscription Management ─────────────────
export const updateSubscriptionSchema = z.object({
    plan: z.enum(['free', 'pro', 'agency']).optional(),
    status: z.enum(['active', 'canceled', 'past_due']).optional(),
    events_limit: z.number().int().min(-1).optional(),
    domains_limit: z.number().int().min(-1).optional(),
});

// ── Event Purge ─────────────────────────────
export const purgeEventsSchema = z.object({
    domainId: z.string().uuid().optional(),
    before: z.string().optional(),
    type: z.enum(['pageview', 'click', 'scroll', 'form', 'custom']).optional(),
}).refine(d => d.domainId || d.before, {
    message: 'Must specify domainId and/or before date',
});

// ── Settings ────────────────────────────────
export const updateSettingSchema = z.object({
    value: z.union([z.string(), z.number(), z.boolean()]),
});

// ── Retention ───────────────────────────────
export const updateRetentionSchema = z.object({
    days: z.number().int().min(1).max(3650),
});
