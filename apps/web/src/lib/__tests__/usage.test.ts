import { describe, expect, it } from 'vitest';
import { billingBanner, meterTone, percent, timeUntil } from '../usage';

const NOW = new Date('2026-10-10T12:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

describe('meterTone', () => {
    it('warns from 80% and is over at the limit', () => {
        expect(meterTone(79, 100)).toBe('ok');
        expect(meterTone(80, 100)).toBe('warn');
        expect(meterTone(100, 100)).toBe('over');
        expect(meterTone(150, 100)).toBe('over');
    });

    it('never warns without a limit', () => {
        expect(meterTone(10_000, null)).toBe('ok');
        expect(percent(10_000, null)).toBe(0);
    });

    it('caps the bar at 100%', () => {
        expect(percent(150, 100)).toBe(100);
    });
});

describe('timeUntil', () => {
    it.each([
        [inDays(12), 'in 12 days'],
        [inDays(1.5), 'in 1 day'],
        [inDays(5 / 24), 'in 5 hours'],
        [inDays(1 / 24), 'in 1 hour'],
        [inDays(0.01), 'in under an hour'],
    ])('%s -> %s', (iso, expected) => {
        expect(timeUntil(iso, NOW)).toBe(expected);
    });
});

describe('billingBanner', () => {
    const paid = { plan: 'pro', planName: 'Pro', paidPlan: 'pro', paidPlanName: 'Pro' };

    it('says nothing while the period has more than a week left', () => {
        expect(billingBanner({ ...paid, state: 'active', currentPeriodEnd: inDays(10) }, NOW)).toBeNull();
    });

    it('warns in the last week', () => {
        const banner = billingBanner({ ...paid, state: 'active', currentPeriodEnd: inDays(3) }, NOW);
        expect(banner?.tone).toBe('info');
        expect(banner?.message).toContain('Your Pro plan ends in 3 days');
    });

    it('explains grace', () => {
        const banner = billingBanner(
            { ...paid, state: 'grace', currentPeriodEnd: inDays(-1), graceEndsAt: inDays(2) },
            NOW,
        );
        expect(banner?.tone).toBe('warning');
        expect(banner?.message).toContain('Your data is kept');
    });

    it('explains the fall back to free', () => {
        const banner = billingBanner(
            { plan: 'free', planName: 'Hobby', paidPlan: 'pro', paidPlanName: 'Pro', state: 'expired', currentPeriodEnd: inDays(-10) },
            NOW,
        );
        expect(banner?.message).toContain('on the free Hobby plan');
        expect(banner?.action).toBe('Renew Pro');
    });

    it('gives each stage its own id, so dismissing one does not hide the next', () => {
        const end = inDays(-1);
        const grace = billingBanner({ ...paid, state: 'grace', currentPeriodEnd: end, graceEndsAt: inDays(2) }, NOW);
        const expired = billingBanner({ ...paid, state: 'expired', currentPeriodEnd: end }, NOW);
        expect(grace?.id).not.toBe(expired?.id);
    });

    it('says nothing for free accounts or admin grants without an end', () => {
        expect(billingBanner({ plan: 'free', state: 'free' }, NOW)).toBeNull();
        expect(billingBanner({ ...paid, state: 'active', currentPeriodEnd: null }, NOW)).toBeNull();
    });
});

describe('limitMessage', () => {
    it('explains paused sites when over the website limit', async () => {
        const { limitMessage } = await import('../../components/UsageMeters');
        const base = { key: 'websites', label: 'Websites', resetsAt: null };
        expect(limitMessage({ ...base, used: 3, limit: 1 })).toContain('2 sites are paused');
        expect(limitMessage({ ...base, used: 1, limit: 1 })).toContain('Remove a site or upgrade');
    });
});
