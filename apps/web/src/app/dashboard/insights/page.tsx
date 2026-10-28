'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Sparkles,
    TrendingUp,
    TrendingDown,
    Target,
    Zap,
    ArrowRight,
    RefreshCw,
    ChevronRight,
    FileText,
    Filter,
} from 'lucide-react';
import { authFetch } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { StatCard } from '@/components/StatCard';
import { ASK_EVENT } from '@/components/AskThravic';
import { AnalystPanel } from '@/components/AnalystPanel';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// GET /api/insights/{domainId}?start=&end=: today's report for the header's date
// range, compared with the period of the same length before it. Every number in
// an insight comes from its `evidence` (computed from the site's data, not by the model).
interface Insight {
    id: string;
    type: 'traffic' | 'page' | 'technical' | 'funnel' | 'opportunity';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    recommendation?: string;
    evidence: Array<{ subject: string; numbers: Record<string, number> }>;
    link: string;
}

interface InsightReport {
    status: 'ok' | 'insufficient_data';
    insights: Insight[];
    aiGenerated: boolean;
    generatedAt: string;
    refreshesLeft: number;
    // The period's headline numbers (the overview fact), against the period before.
    summary: Partial<Record<
        'sessions' | 'sessionsChangePct' | 'visitors' | 'visitorsChangePct' | 'pageviews' | 'pageviewsChangePct'
        | 'bounceRatePct' | 'bounceRateBeforePct' | 'avgSessionSeconds' | 'avgSessionSecondsBefore', number>> | null;
    period: { current: { start: string; end: string }; previous: { start: string; end: string } };
}

function formatDuration(seconds: number) {
    const s = Math.round(seconds);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatPeriod({ start, end }: { start: string; end: string }) {
    const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${day(start)} – ${day(end)}`;
}

// `sessionsChangePct` -> "Sessions change", with the unit taken from the suffix.
function formatEvidence(key: string, value: number): [string, string] {
    const units: Array<[string, string]> = [['Pct', '%'], ['Ms', ' ms'], ['Seconds', ' s']];
    let unit = '';
    let name = key;
    for (const [suffix, symbol] of units) {
        if (name.endsWith(suffix)) {
            name = name.slice(0, -suffix.length);
            unit = symbol;
            break;
        }
    }
    const label = name.replace(/([A-Z])/g, ' $1').toLowerCase();
    const sign = key.endsWith('ChangePct') || key.endsWith('Delta') ? (value > 0 ? '+' : '') : '';
    return [label.charAt(0).toUpperCase() + label.slice(1), `${sign}${value.toLocaleString()}${unit}`];
}

interface TrendData {
    historical: Array<{
        date: string;
        pageviews: number;
        visitors: number;
        pageviewsMA: number;
        visitorsMA: number;
    }>;
    forecast: Array<{
        date: string;
        predicted: number;
        confidence: number;
    }>;
    trend: {
        direction: 'up' | 'down' | 'stable';
        strength: number;
    };
}

const insightIcons: Record<string, React.ElementType> = {
    traffic: TrendingUp,
    page: FileText,
    technical: Zap,
    funnel: Filter,
    opportunity: Target,
};

// Priority is always shown as a text badge; the colour only reinforces it.
const PRIORITIES = ['high', 'medium', 'low'] as const;
const PRIORITY_LABEL: Record<Insight['priority'], string> = { high: 'High', medium: 'Medium', low: 'Low' };
const PRIORITY_BADGE: Record<Insight['priority'], string> = {
    high: 'badge badge-error',
    medium: 'badge badge-warning',
    low: 'badge badge-success',
};

async function getInsights(domainId: string, range: { start: string; end: string }, refresh = false) {
    const params = new URLSearchParams({ start: range.start, end: range.end });
    const res = await authFetch(`${API_URL}/api/insights/${domainId}${refresh ? '/refresh' : ''}?${params}`, {
        method: refresh ? 'POST' : 'GET'
    });
    const body = await res.json();
    return res.ok ? { report: body as InsightReport } : { error: (body?.error as string) || 'Could not load insights' };
}

async function getTrends(domainId: string): Promise<TrendData | null> {
    const res = await authFetch(`${API_URL}/api/insights/${domainId}/trends`);
    // An error body is not trend data; show the chart's empty state instead.
    return res.ok ? res.json() : null;
}

export default function InsightsPage() {
    const { selectedDomainId, selectedDomain, loading: domainLoading } = useDomain();
    const range = useApiRange();
    // Reports are cached per day, so Live's moving range end needn't re-fetch them.
    const dayKey = `${range.start.slice(0, 13)}|${range.end.slice(0, 10)}`;
    const [report, setReport] = useState<InsightReport | null>(null);
    const [trends, setTrends] = useState<TrendData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Every insight opens with its full detail; the reader can fold any away.
    const [folded, setFolded] = useState<Set<string>>(new Set());
    const insights = report?.insights ?? [];

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }

        const loadData = async () => {
            setLoading(true);
            setError(null);
            setFolded(new Set());

            const [insightsData, trendsData] = await Promise.all([
                getInsights(selectedDomainId, range),
                getTrends(selectedDomainId)
            ]);

            setReport(insightsData.report ?? null);
            setError(insightsData.error ?? null);
            setTrends(trendsData);
            setLoading(false);
        };

        loadData();
        // range is read through dayKey
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDomainId, domainLoading, dayKey]);

    const refresh = async () => {
        if (!selectedDomainId) return;
        setRefreshing(true);
        setError(null);
        const result = await getInsights(selectedDomainId, range, true);
        if (result.report) setReport(result.report);
        else setError(result.error ?? null);
        setRefreshing(false);
    };

    // Actual pageviews (headline), the moving-average trend and the forecast on one
    // axis. The forecast starts at today's actual value so the line continues.
    const historical = trends?.historical ?? [];
    const forecast = trends?.forecast ?? [];
    const lastActual = historical[historical.length - 1];
    const chartData: Record<string, unknown>[] = [
        ...historical.map((h, i) => ({
            date: h.date,
            actual: Number(h.pageviews),
            trend: Number(h.pageviewsMA),
            ...(i === historical.length - 1 && forecast.length > 0 ? { forecast: Number(h.pageviews) } : {}),
        })),
        ...forecast.map(f => ({ date: f.date, forecast: Number(f.predicted) })),
    ];

    const counts = {
        high: insights.filter(i => i.priority === 'high').length,
        medium: insights.filter(i => i.priority === 'medium').length,
        low: insights.filter(i => i.priority === 'low').length,
    };

    const header = (
        <PageHeader
            title="AI insights"
            subtitle={report
                ? `What changed ${formatPeriod(report.period.current)}, against ${formatPeriod(report.period.previous)}, and what to do about it`
                : 'What changed on your site in the selected period, and what to do about it'}
            badge={report && report.status === 'ok' ? (
                <span className="badge" title={report.aiGenerated ? 'Written by AI from your numbers' : 'AI unavailable: written by rules from the same numbers'}>
                    {report.aiGenerated ? 'AI' : 'Rule-based'}
                </span>
            ) : undefined}
            actions={
                <>
                    {report && (
                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                            Updated {new Date(report.generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {report.refreshesLeft} refresh{report.refreshesLeft === 1 ? '' : 'es'} left today
                        </span>
                    )}
                    <button
                        onClick={refresh}
                        disabled={refreshing || !report || report.refreshesLeft === 0}
                        className="btn btn-secondary"
                    >
                        <RefreshCw size={16} className={refreshing ? 'spin' : undefined} />
                        {refreshing ? 'Analysing…' : 'Refresh'}
                    </button>
                </>
            }
        />
    );

    if (loading) {
        return (
            <div className="page-stack">
                <div className="skeleton" style={{ height: '28px', width: '180px' }} />
                <div className="split-grid">
                    <ChartCard title="Traffic forecast" loading height={260}><div /></ChartCard>
                    <ChartCard title="Insight summary" loading height={260}><div /></ChartCard>
                </div>
                <ChartCard title="All insights" loading height={200}><div /></ChartCard>
            </div>
        );
    }

    if (!selectedDomainId) {
        return (
            <div className="page-stack">
                {header}
                <div className="card empty-note">Select a website to see its insights.</div>
            </div>
        );
    }

    const summary = report?.status === 'ok' ? report.summary : null;
    const direction = trends?.trend?.direction;
    const TrendIcon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : ArrowRight;

    return (
        <div className="page-stack">
            {header}

            {error && (
                <div role="alert" className="card" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>
                    {error}
                </div>
            )}

            {summary && (
                <div className="stat-grid">
                    <StatCard label="Sessions" value={(summary.sessions ?? 0).toLocaleString()} change={summary.sessionsChangePct} />
                    <StatCard label="Visitors" value={(summary.visitors ?? 0).toLocaleString()} change={summary.visitorsChangePct} />
                    <StatCard label="Page views" value={(summary.pageviews ?? 0).toLocaleString()} change={summary.pageviewsChangePct} />
                    <StatCard label="Bounce rate" value={`${summary.bounceRatePct ?? 0}%`} lowerIsBetter
                        hint={summary.bounceRateBeforePct !== undefined ? `${summary.bounceRateBeforePct}% the period before` : undefined} />
                    <StatCard label="Avg. session" value={formatDuration(summary.avgSessionSeconds ?? 0)}
                        hint={summary.avgSessionSecondsBefore !== undefined ? `${formatDuration(summary.avgSessionSecondsBefore)} the period before` : undefined} />
                </div>
            )}

            {report && <AnalystPanel domainId={selectedDomainId} />}

            <div className="split-grid">
                <ChartCard
                    title="Traffic forecast"
                    subtitle="Pageviews per day, with the trend and a 7-day forecast"
                    action={direction ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                            <TrendIcon size={16} aria-hidden="true" style={{
                                color: direction === 'up' ? 'var(--color-success)' : direction === 'down' ? 'var(--color-error)' : 'var(--color-text-muted)',
                            }} />
                            {direction === 'up' ? 'Trending up' : direction === 'down' ? 'Trending down' : 'Stable'}
                        </span>
                    ) : undefined}
                >
                    <TimeSeriesChart
                        data={chartData}
                        xKey="date"
                        height={340}
                        series={[
                            { key: 'actual', label: 'Pageviews' },
                            { key: 'trend', label: '7-day average', muted: true },
                            { key: 'forecast', label: 'Forecast', muted: true },
                        ]}
                    />
                </ChartCard>

                <div className="page-stack" style={{ minWidth: 0 }}>
                    <ChartCard title="Insight summary" subtitle="Today's report by priority">
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {PRIORITIES.map(p => (
                                <li key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                                    <span className={PRIORITY_BADGE[p]}>{PRIORITY_LABEL[p]} priority</span>
                                    <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{counts[p]}</span>
                                </li>
                            ))}
                        </ul>
                    </ChartCard>

                    {forecast.length > 0 && (
                        <ChartCard title="Forecast" subtitle="Predicted pageviews, next 5 days" flush>
                            <table className="data-table">
                                <tbody>
                                    {forecast.slice(0, 5).map(f => (
                                        <tr key={f.date}>
                                            <td className="muted" style={{ paddingLeft: 20 }}>
                                                {new Date(`${f.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                                            </td>
                                            <td className="num" style={{ paddingRight: 20 }}>{Number(f.predicted).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </ChartCard>
                    )}
                </div>
            </div>

            <ChartCard title="All insights" subtitle={insights.length ? `${insights.length} for ${report ? formatPeriod(report.period.current) : 'this period'}` : undefined} flush>
                {insights.length === 0 ? (
                    <p className="empty-note">
                        {report?.status === 'insufficient_data'
                            ? `No visits to ${selectedDomain?.domain ?? 'this site'} in this period yet. Pick a longer date range to see insights.`
                            : error ? 'Insights could not be loaded.' : 'No insights yet.'}
                    </p>
                ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {insights.map(insight => {
                            const Icon = insightIcons[insight.type] || Sparkles;
                            const open = !folded.has(insight.id);
                            return (
                                <li key={insight.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                                    <button
                                        type="button"
                                        aria-expanded={open}
                                        onClick={() => setFolded(prev => {
                                            const next = new Set(prev);
                                            if (open) next.add(insight.id); else next.delete(insight.id);
                                            return next;
                                        })}
                                        style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%',
                                            padding: '12px 20px', background: 'transparent', border: 'none',
                                            textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit',
                                        }}
                                    >
                                        <Icon size={16} aria-hidden="true" style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }} />
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{insight.title}</span>
                                                <span className={PRIORITY_BADGE[insight.priority]}>{PRIORITY_LABEL[insight.priority]}</span>
                                            </span>
                                            <span style={{ display: 'block', marginTop: 2, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                                {insight.description}
                                            </span>
                                        </span>
                                        <ChevronRight size={16} aria-hidden="true" style={{
                                            color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2,
                                            transform: open ? 'rotate(90deg)' : 'none',
                                            transition: 'transform var(--transition-fast)',
                                        }} />
                                    </button>

                                    {open && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px 14px 48px' }}>
                                            {insight.recommendation && (
                                                <div style={{
                                                    padding: '8px 12px',
                                                    background: 'var(--color-bg-tertiary)',
                                                    borderRadius: 'var(--radius-md)',
                                                    borderLeft: '3px solid var(--color-accent-primary)',
                                                }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Recommendation</span>
                                                    <p style={{ fontSize: '0.8125rem', margin: '2px 0 0' }}>{insight.recommendation}</p>
                                                </div>
                                            )}
                                            {insight.evidence.map(item => (
                                                <div key={item.subject} style={{ fontSize: '0.8125rem' }}>
                                                    <div style={{ color: 'var(--color-text-muted)', marginBottom: 4 }}>
                                                        Based on: {item.subject}
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontVariantNumeric: 'tabular-nums' }}>
                                                        {Object.entries(item.numbers).map(([key, value]) => {
                                                            const [label, shown] = formatEvidence(key, value);
                                                            return (
                                                                <span key={key}>
                                                                    <span style={{ color: 'var(--color-text-muted)' }}>{label}:</span> {shown}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 18px' }}>
                                                <Link
                                                    href={insight.link}
                                                    style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                >
                                                    See the data <ArrowRight size={14} aria-hidden="true" />
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => window.dispatchEvent(new CustomEvent(ASK_EVENT, {
                                                        detail: `Tell me more about this insight: "${insight.title}". What is behind it and what should I do?`,
                                                    }))}
                                                    style={{
                                                        fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        padding: 0, background: 'none', border: 'none', cursor: 'pointer',
                                                        color: 'var(--color-text-secondary)', font: 'inherit',
                                                    }}
                                                >
                                                    <Sparkles size={13} aria-hidden="true" /> Ask about this
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </ChartCard>
        </div>
    );
}
