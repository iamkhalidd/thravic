'use client';

import { meterTone, percent, shortDate, timeUntil, TONE_COLORS, type UsageMeter } from '@/lib/usage';

const LIMIT_REACHED: Record<string, string> = {
    events: 'New events and recordings are not being stored until the allowance renews, or until you upgrade.',
    websites: 'Remove a site or upgrade to add another.',
    team: 'Upgrade to invite more people.',
    recordings: 'New recordings start again when the daily allowance renews.',
};

/** What hitting a limit means; past the website limit (a lapsed plan) the extra
 * sites are paused rather than merely blocking new ones. */
export function limitMessage(meter: UsageMeter): string {
    if (meter.key === 'websites' && meter.limit !== null && meter.used > meter.limit) {
        const paused = meter.used - meter.limit;
        return `${paused} site${paused === 1 ? ' is' : 's are'} paused: kept, but not collecting. Choose which keeps collecting on the Tracking page, or renew.`;
    }
    return LIMIT_REACHED[meter.key] ?? 'Limit reached.';
}

/** Every allowance on the account, with when each one renews. */
export function UsageMeters({ meters, now = new Date() }: { meters: UsageMeter[]; now?: Date }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', marginTop: 'var(--space-lg)' }}>
            {meters.map(meter => {
                const tone = meterTone(meter.used, meter.limit);
                const color = TONE_COLORS[tone];
                const unlimited = meter.limit === null;
                return (
                    <div key={meter.key}>
                        <div className="flex items-center justify-between" style={{ fontSize: '0.875rem', marginBottom: 'var(--space-xs)', gap: 'var(--space-sm)' }}>
                            <span>{meter.label}</span>
                            <span style={{ color: 'var(--color-text-secondary)' }}>
                                {meter.used.toLocaleString()}
                                {unlimited ? ' · unlimited' : ` of ${meter.limit!.toLocaleString()}`}
                            </span>
                        </div>
                        {!unlimited && (
                            <div
                                role="progressbar"
                                aria-label={`${meter.label} used`}
                                aria-valuemin={0}
                                aria-valuemax={meter.limit!}
                                aria-valuenow={meter.used}
                                style={{ height: '8px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}
                            >
                                <div style={{ width: `${percent(meter.used, meter.limit)}%`, height: '100%', background: color, borderRadius: '4px' }} />
                            </div>
                        )}
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                            {meter.resetsAt && <>Resets {timeUntil(meter.resetsAt, now)} ({shortDate(meter.resetsAt)}). </>}
                            {tone === 'over' && <span style={{ color }}>{limitMessage(meter)}</span>}
                            {tone !== 'over' && meter.projectedLimitAt && (
                                <span style={{ color: TONE_COLORS.warn }}>
                                    At this pace it runs out around {shortDate(meter.projectedLimitAt)}.
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
