'use client';

import { useEffect, useState } from 'react';
import { Repeat } from 'lucide-react';
import { useDomain } from '@/contexts/DomainContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { StatCard } from '@/components/StatCard';
import { visitors as visitorsApi, type Retention } from '@/lib/api';

const WEEK_CHOICES = [4, 8, 12] as const;

function weekLabel(iso: string): string {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Darker cells for a higher share, on the theme's text color. */
function cellStyle(percent: number): React.CSSProperties {
    const strength = Math.min(percent, 60) / 60;
    return {
        background: `color-mix(in srgb, var(--color-text-primary) ${Math.round(strength * 55 + 4)}%, transparent)`,
        color: strength > 0.55 ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
    };
}

export default function RetentionPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [weeks, setWeeks] = useState<number>(8);
    const [data, setData] = useState<Retention | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        visitorsApi.retention(selectedDomainId, weeks).then(({ data, error }) => {
            if (cancelled) return;
            setData(data ?? null);
            setError(data ? null : error || 'Could not load retention');
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [selectedDomainId, domainLoading, weeks]);

    const columns = Math.max(0, ...(data?.cohorts ?? []).map(c => c.weeks.length));
    const rate = (value: number | null | undefined) => value == null ? '–' : `${value}%`;

    return (
        <div className="page-stack">
            <PageHeader
                title="Retention"
                subtitle="How many new visitors come back in the weeks after their first visit."
                actions={
                    <select
                        className="input"
                        aria-label="Weeks to show"
                        value={weeks}
                        onChange={e => setWeeks(Number(e.target.value))}
                        style={{ width: 'auto' }}
                    >
                        {WEEK_CHOICES.map(n => <option key={n} value={n}>Last {n} weeks</option>)}
                    </select>
                }
            />

            {error ? (
                <div role="alert" className="card" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</div>
            ) : (
                <>
                    <div className="stat-grid">
                        <StatCard loading={loading} icon={Repeat} label="Back after 1 week" value={rate(data?.week1)} hint="of new visitors, on average" />
                        <StatCard loading={loading} icon={Repeat} label="Back after 4 weeks" value={rate(data?.week4)} hint="of new visitors, on average" />
                    </div>

                    <ChartCard flush title="Weekly cohorts" subtitle="Each row is the visitors who first came that week, and the share seen again each week after.">
                        {loading ? (
                            <div className="skeleton" style={{ height: 200, margin: '0 20px 20px' }} />
                        ) : !data || data.cohorts.every(c => c.visitors === 0) ? (
                            <div className="empty-note">No new visitors in this period yet.</div>
                        ) : (
                            <div style={{ overflowX: 'auto', marginTop: 6 }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th style={{ paddingLeft: 20 }}>First visit</th>
                                            <th className="num">New visitors</th>
                                            {Array.from({ length: columns }, (_, i) => (
                                                <th key={i} className="num">Week {i + 1}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.cohorts.map(cohort => (
                                            <tr key={cohort.week}>
                                                <td style={{ paddingLeft: 20, whiteSpace: 'nowrap' }}>Week of {weekLabel(cohort.week)}</td>
                                                <td className="num">{cohort.visitors.toLocaleString()}</td>
                                                {Array.from({ length: columns }, (_, i) => {
                                                    const cell = cohort.weeks[i];
                                                    if (!cell || cohort.visitors === 0) return <td key={i} className="num muted" />;
                                                    return (
                                                        <td key={i} className="num" title={`${cell.count} of ${cohort.visitors} came back`}
                                                            style={{ ...cellStyle(cell.percent), fontVariantNumeric: 'tabular-nums' }}>
                                                            {cell.percent}%
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </ChartCard>

                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                        A visitor is counted once, in the week of their first visit. Weeks run Monday to Sunday (UTC).
                        Visitors who clear cookies or switch devices look new, so these numbers are a floor.
                    </p>
                </>
            )}
        </div>
    );
}
