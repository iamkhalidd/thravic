'use client';

import { useEffect, useState } from 'react';
import { Repeat } from 'lucide-react';
import { useDomain } from '@/contexts/DomainContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { StatCard } from '@/components/StatCard';
import { inEvery } from '@/components/charts/format';
import { visitors as visitorsApi, type Retention } from '@/lib/api';

const WEEK_CHOICES = [4, 8, 12] as const;

function weekLabel(iso: string): string {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** A stronger blue for a higher share; 40% and up is full strength. */
function cellAlpha(percent: number): number {
    return Math.min(percent / 40, 1) * 0.8 + 0.1;
}

function cellBackground(alpha: number): string {
    return `color-mix(in srgb, var(--chart-1) ${Math.round(alpha * 100)}%, transparent)`;
}

function weekHeader(i: number): string {
    return i === 0 ? '1 week later' : `${i + 1} weeks`;
}

/** "About 1 in 5 new visitors come back a week later." */
function retentionSummary(week1?: number | null, week4?: number | null) {
    if (week1 == null) return undefined;
    if (week1 <= 0) return 'No new visitors have come back a week later yet.';
    return (
        <>
            <strong>{inEvery(week1 / 100)}</strong> new visitors come back a week later
            {week4 != null && <>, and <strong>{inEvery(week4 / 100)}</strong> after four weeks</>}.
        </>
    );
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

                    <ChartCard
                        title="Do visitors come back?"
                        subtitle="Each row is the people who first came that week"
                        info="A cohort is everyone whose first visit was in the same week. Each cell is the share of them seen again that many weeks later."
                        summary={retentionSummary(data?.week1, data?.week4)}
                    >
                        {loading ? (
                            <div className="skeleton" style={{ height: 200 }} />
                        ) : !data || data.cohorts.every(c => c.visitors === 0) ? (
                            <div className="empty-note">No new visitors in this period yet.</div>
                        ) : (
                            <>
                                <div style={{ overflowX: 'auto', margin: '0 -4px' }}>
                                    <table className="cohort-table">
                                        <thead>
                                            <tr>
                                                <th scope="col">First visit</th>
                                                <th scope="col">People</th>
                                                {Array.from({ length: columns }, (_, i) => (
                                                    <th key={i} scope="col">{weekHeader(i)}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.cohorts.map(cohort => (
                                                <tr key={cohort.week}>
                                                    <th scope="row" style={{ fontWeight: 400, color: 'var(--color-text-primary)', fontSize: '0.8125rem', paddingRight: 8 }}>
                                                        Week of {weekLabel(cohort.week)}
                                                    </th>
                                                    <td className="people">{cohort.visitors.toLocaleString()}</td>
                                                    {Array.from({ length: columns }, (_, i) => {
                                                        const cell = cohort.weeks[i];
                                                        // Weeks that haven't happened yet for this cohort
                                                        if (!cell) return <td key={i}><div className="cohort-cell future" aria-label="Not yet" /></td>;
                                                        if (cohort.visitors === 0) return <td key={i}><div className="cohort-cell" style={{ color: 'var(--color-text-muted)' }}>–</div></td>;
                                                        const alpha = cellAlpha(cell.percent);
                                                        return (
                                                            <td key={i}>
                                                                <div className={`cohort-cell${alpha > 0.5 ? ' strong' : ''}`}
                                                                    style={{ background: cellBackground(alpha) }}
                                                                    title={`${cell.count} of ${cohort.visitors} came back`}>
                                                                    {cell.percent}%
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="chart-foot">
                                    <span className="cohort-legend" aria-hidden="true">
                                        Fewer came back
                                        {[0, 12, 24, 40].map(p => <i key={p} style={{ background: cellBackground(cellAlpha(p)) }} />)}
                                        More came back
                                    </span>
                                    <span>Dashed cells are weeks still to come</span>
                                </div>
                            </>
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
