// Wording and thresholds for usage meters and the plan banner, kept out of the
// components so they can be tested without rendering.

export interface UsageMeter {
    key: 'events' | 'websites' | 'team' | 'recordings' | string;
    label: string;
    used: number;
    /** null = unlimited */
    limit: number | null;
    resetsAt: string | null;
    projectedLimitAt?: string | null;
}

export type MeterTone = 'ok' | 'warn' | 'over';

export function meterTone(used: number, limit: number | null): MeterTone {
    if (limit === null || limit <= 0) return 'ok';
    if (used >= limit) return 'over';
    if (used * 100 >= limit * 80) return 'warn';
    return 'ok';
}

export const TONE_COLORS: Record<MeterTone, string> = {
    ok: 'var(--color-text-primary)',
    warn: 'var(--color-warning)',
    over: 'var(--color-error)',
};

export function percent(used: number, limit: number | null): number {
    if (limit === null || limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** "in 12 days", "in 5 hours", "in under an hour". */
export function timeUntil(iso: string, now: Date = new Date()): string {
    const ms = new Date(iso).getTime() - now.getTime();
    if (ms < HOUR) return 'in under an hour';
    if (ms < DAY) {
        const hours = Math.floor(ms / HOUR);
        return `in ${hours} hour${hours === 1 ? '' : 's'}`;
    }
    const days = Math.floor(ms / DAY);
    return `in ${days} day${days === 1 ? '' : 's'}`;
}

export function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export interface BillingState {
    plan: string;
    planName?: string;
    paidPlan?: string;
    paidPlanName?: string;
    state?: 'free' | 'active' | 'grace' | 'expired';
    currentPeriodEnd?: string | null;
    graceEndsAt?: string | null;
}

export interface Banner {
    /** Changes when the situation does, so a dismissal only hides this one. */
    id: string;
    tone: 'info' | 'warning';
    message: string;
    action: string;
}

/** Days before the end that the "ends soon" banner starts showing. */
export const ENDING_SOON_DAYS = 7;

export function billingBanner(sub: BillingState | null, now: Date = new Date()): Banner | null {
    if (!sub?.state || !sub.currentPeriodEnd) return null;
    const paid = sub.paidPlanName || sub.paidPlan || 'paid';
    const end = sub.currentPeriodEnd;

    if (sub.state === 'active') {
        if (new Date(end).getTime() - now.getTime() > ENDING_SOON_DAYS * DAY) return null;
        return {
            id: `ending:${end}`,
            tone: 'info',
            message: `Your ${paid} plan ends ${timeUntil(end, now)} (${shortDate(end)}). Plans don't renew automatically.`,
            action: 'Renew',
        };
    }
    if (sub.state === 'grace' && sub.graceEndsAt) {
        return {
            id: `grace:${end}`,
            tone: 'warning',
            message: `Your ${paid} plan ended on ${shortDate(end)}. Renew by ${shortDate(sub.graceEndsAt)} to keep its features; after that the account moves to the free plan. Your data is kept.`,
            action: 'Renew now',
        };
    }
    if (sub.state === 'expired') {
        return {
            id: `expired:${end}`,
            tone: 'warning',
            message: `Your ${paid} plan has ended and the account is on the free ${sub.planName || 'Hobby'} plan. Your data is kept; renew to unlock it.`,
            action: `Renew ${paid}`,
        };
    }
    return null;
}
