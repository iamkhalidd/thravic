'use client';

import { meterTone, percent, shortDate, timeUntil, TONE_COLORS, type UsageMeter } from '@/lib/usage';

const LIMIT_REACHED: Record<string, string> = {
    events: 'We keep collecting up to 120% of the allowance, then new events and recordings stop until it renews. Upgrade to keep everything.',
    websites: 'Remove a site or upgrade to add another.',
    team: 'Upgrade to invite more people.',
    recordings: 'New recordings start again when the allowance renews.',
};

const DAY = 24 * 3600_000;

/** What hitting a limit means; past the website limit (a lapsed plan) the extra
 * sites are paused rather than merely blocking new ones. */
export function limitMessage(meter: UsageMeter): string {
    if (meter.key === 'websites' && meter.limit !== null && meter.used > meter.limit) {
        const paused = meter.used - meter.limit;
        return `${paused} site${paused === 1 ? ' is' : 's are'} paused: kept, but not collecting. Choose which keeps collecting on the Tracking page, or renew.`;
    }
    return LIMIT_REACHED[meter.key] ?? 'Limit reached.';
}

/** Where usage will be when the allowance renews, at the current pace, as a percent of the limit. */
function projectedAtReset(meter: UsageMeter, now: Date): number | null {
    if (meter.limit === null || meter.limit <= 0 || !meter.projectedLimitAt || !meter.resetsAt) return null;
    const toLimit = new Date(meter.projectedLimitAt).getTime() - now.getTime();
    const toReset = new Date(meter.resetsAt).getTime() - now.getTime();
    if (toLimit <= 0 || toReset <= 0) return null;
    const perMs = (meter.limit - meter.used) / toLimit;
    return Math.min(100, ((meter.used + perMs * toReset) / meter.limit) * 100);
}

/**
 * Every allowance on the account: how much is used, where the current pace
 * leads (a faded stretch of the bar) and when it renews, said in a sentence.
 */
export function UsageMeters({ meters, now = new Date() }: { meters: UsageMeter[]; now?: Date }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', marginTop: 'var(--space-lg)' }}>
            {meters.map(meter => {
                const tone = meterTone(meter.used, meter.limit);
                const color = tone === 'ok' ? 'var(--chart-1)' : TONE_COLORS[tone];
                const unlimited = meter.limit === null;
                const used = percent(meter.used, meter.limit);
                const projected = tone === 'over' ? null : projectedAtReset(meter, now);
                const hitsLimit = !!meter.projectedLimitAt && !!meter.resetsAt
                    && new Date(meter.projectedLimitAt).getTime() < new Date(meter.resetsAt).getTime();
                const daysToLimit = meter.projectedLimitAt
                    ? Math.max(1, Math.ceil((new Date(meter.projectedLimitAt).getTime() - now.getTime()) / DAY))
                    : null;
                const noun = meter.label.toLowerCase();

                if (unlimited) {
                    return (
                        <div key={meter.key} className="meter">
                            <div className="meter-label"><span>{meter.label}</span></div>
                            <div className="meter-head"><b>{meter.used.toLocaleString()}</b><span>{noun} · unlimited on your plan</span></div>
                        </div>
                    );
                }
                return (
                    <div key={meter.key} className="meter">
                        <div className="meter-label"><span>{meter.label}</span></div>
                        <div className="meter-head">
                            <b>{used}%</b>
                            <span>{meter.used.toLocaleString()} of {meter.limit!.toLocaleString()} {noun}</span>
                        </div>
                        <div
                            className="meter-track"
                            role="progressbar"
                            aria-label={`${meter.label} used`}
                            aria-valuemin={0}
                            aria-valuemax={meter.limit!}
                            aria-valuenow={meter.used}
                        >
                            {projected !== null && projected > used && (
                                <span className="meter-projected" style={{ left: 0, width: `${projected}%`, background: color }} />
                            )}
                            <span className="meter-used" style={{ width: `${Math.max(used, 1)}%`, background: color }} />
                        </div>
                        {projected !== null && projected > used && used > 4 && used < 92 && (
                            <div className="meter-today" aria-hidden="true"><span style={{ left: `${used}%` }}>today</span></div>
                        )}
                        <p className="meter-note">
                            {tone === 'over' && <span style={{ color }}>{limitMessage(meter)} </span>}
                            {tone !== 'over' && hitsLimit && daysToLimit !== null && (
                                <>At this pace you&apos;ll reach the limit in <strong>about {daysToLimit} day{daysToLimit === 1 ? '' : 's'}</strong>. </>
                            )}
                            {tone !== 'over' && !hitsLimit && projected !== null && <>At this pace you&apos;ll stay under the limit. </>}
                            {meter.resetsAt && <>It resets {timeUntil(meter.resetsAt, now)} ({shortDate(meter.resetsAt)}).</>}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}
