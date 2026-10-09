'use client';

import { useState, useEffect } from 'react';
import {
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    CheckCircle,
    Minus,
    Sigma,
} from 'lucide-react';
import { analytics } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { percentChange } from '@/components/ChangeBadge';

type Metric = 'visitors' | 'sessions' | 'pageviews';
type Row = { date: string; visitors: number; sessions: number; pageviews: number };

const METRICS: Array<[Metric, string]> = [['visitors', 'Visitors'], ['sessions', 'Sessions'], ['pageviews', 'Pageviews']];

/** "2026-10-05" (a UTC day) or an ISO timestamp -> "Mon, Oct 5". */
function longDay(value: string): string {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function TrendsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const range = useApiRange();
    const [chartData, setChartData] = useState<Row[]>([]);
    // The previous period, day by day; null unless Compare is on
    const [previousData, setPreviousData] = useState<Row[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [metric, setMetric] = useState<Metric>('visitors');

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }
        let cancelled = false;

        const loadData = async () => {
            if (!range.background) setLoading(true);
            setError(null);
            // GET /api/analytics/{id}/dashboard: one row per day in `timeseries`.
            const [result, prevResult] = await Promise.all([
                analytics.getDashboard(selectedDomainId, range.start, range.end),
                range.compare ? analytics.getDashboard(selectedDomainId, range.compare.start, range.compare.end) : null,
            ]);
            if (cancelled) return;
            setPreviousData(prevResult?.data ? prevResult.data.timeseries || [] : null);
            if (result.data) {
                setChartData(result.data.timeseries || []);
            } else {
                setChartData([]);
                setError(result.error || 'Could not load traffic trends.');
            }
            setLoading(false);
        };

        loadData();
        return () => { cancelled = true; };
    }, [selectedDomainId, range, domainLoading]);

    const metricLabel = METRICS.find(([key]) => key === metric)?.[1] ?? 'Visitors';
    const metricSwitch = (
        <div className="segmented" role="tablist" aria-label="Metric">
            {METRICS.map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={metric === key} onClick={() => setMetric(key)}>
                    {label}
                </button>
            ))}
        </div>
    );
    const header = <PageHeader title="Trends" subtitle="How traffic changes across the selected period." actions={metricSwitch} />;

    if (loading || domainLoading) {
        return (
            <div className="page-stack">
                {header}
                <div className="stat-grid">
                    {[1, 2, 3, 4].map(i => <StatCard key={i} label="" value="" loading />)}
                </div>
                <ChartCard title="" loading height={280}><span /></ChartCard>
            </div>
        );
    }

    if (!selectedDomainId) {
        return (
            <div className="page-stack">
                {header}
                <div className="card"><p className="empty-note">Select a website to see its traffic trends.</p></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="page-stack">
                {header}
                <div className="card" role="alert">
                    <p className="empty-note" style={{ color: 'var(--color-error)' }}>{error}</p>
                </div>
            </div>
        );
    }

    const total = chartData.reduce((sum, d) => sum + (d[metric] || 0), 0);
    const previousTotal = previousData?.reduce((sum, d) => sum + (d[metric] || 0), 0);
    // The previous period, aligned day by day, as a dashed comparison line.
    const previousKey = `previous_${metric}`;
    const plotted = previousData
        ? chartData.map((d, i) => ({ ...d, [previousKey]: previousData[i]?.[metric] ?? null }))
        : chartData;

    // Trend: second half of the period against the first half.
    const halfLength = Math.floor(chartData.length / 2);
    const firstHalf = chartData.slice(0, halfLength).reduce((sum, d) => sum + (d[metric] || 0), 0);
    const secondHalf = chartData.slice(halfLength).reduce((sum, d) => sum + (d[metric] || 0), 0);
    const trend = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
    const hasTraffic = chartData.some(d => (d[metric] || 0) > 0);
    // No traffic in the first half means a percentage change cannot be computed.
    const newTraffic = hasTraffic && firstHalf === 0 && secondHalf > 0;
    const status = !hasTraffic ? 'No data yet' : newTraffic || trend > 0 ? 'Growing' : trend < 0 ? 'Declining' : 'Steady';
    const statusDetail = !hasTraffic
        ? 'No traffic recorded in this period'
        : newTraffic
            ? 'All traffic arrived in the second half'
            : trend > 0 ? `${metricLabel} are increasing` : trend < 0 ? 'Consider reviewing your sources' : `${metricLabel} are level`;
    const bestDay = hasTraffic
        ? chartData.reduce((max, d) => ((d[metric] || 0) > (max[metric] || 0) ? d : max), chartData[0])
        : null;

    const trendColor = !hasTraffic ? 'var(--color-text-primary)'
        : newTraffic || trend > 0 ? 'var(--color-success)' : trend < 0 ? 'var(--color-error)' : 'var(--color-text-primary)';
    const TrendIcon = !hasTraffic || (!newTraffic && trend === 0) ? Minus : newTraffic || trend > 0 ? TrendingUp : TrendingDown;
    const trendValue = !hasTraffic ? '—' : newTraffic ? 'New' : `${trend >= 0 ? '+' : '−'}${Math.abs(trend).toFixed(1)}%`;

    const StatusIcon = status === 'Growing' ? CheckCircle : status === 'Declining' ? AlertTriangle : Minus;
    const statusColor = status === 'Growing' ? 'var(--color-success)' : status === 'Declining' ? 'var(--color-warning)' : 'var(--color-text-primary)';

    return (
        <div className="page-stack">
            {header}

            <div className="stat-grid">
                <StatCard
                    label={`Total ${metricLabel.toLowerCase()}`}
                    icon={Sigma}
                    value={total.toLocaleString()}
                    change={percentChange(total, previousTotal)}
                    hint={previousTotal !== undefined ? `${previousTotal.toLocaleString()} in the previous period` : 'In the selected period'}
                />
                <StatCard
                    label={`${metricLabel} trend`}
                    value={
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: trendColor }}>
                            {hasTraffic && <TrendIcon size={18} aria-hidden="true" />}
                            {trendValue}
                        </span>
                    }
                    hint="Second half of the period vs the first"
                />
                <StatCard
                    label="Best day"
                    value={bestDay ? longDay(bestDay.date) : '—'}
                    hint={bestDay ? `${(bestDay[metric] || 0).toLocaleString()} ${metricLabel.toLowerCase()}` : 'No traffic in this period'}
                />
                <StatCard
                    label="Status"
                    value={
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: statusColor }}>
                            <StatusIcon size={18} aria-hidden="true" />
                            {status}
                        </span>
                    }
                    hint={statusDetail}
                />
            </div>

            <ChartCard title={`${metricLabel} over time`} subtitle="Per day">
                <TimeSeriesChart
                    data={plotted}
                    xKey="date"
                    height={280}
                    series={[
                        { key: metric, label: metricLabel },
                        ...(previousData ? [{ key: previousKey, label: `${metricLabel}, previous period`, muted: true }] : []),
                    ]}
                />
            </ChartCard>
        </div>
    );
}
