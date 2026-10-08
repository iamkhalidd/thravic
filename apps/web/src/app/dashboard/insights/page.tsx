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
import { useDomain } from '@/contexts/DomainContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// GET /api/insights/{domainId}: today's report. Every number in an insight comes
// from its `evidence` (computed from the site's data, not by the model).
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
    minSessions: number;
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

async function getInsights(domainId: string, refresh = false) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_URL}/api/insights/${domainId}${refresh ? '/refresh' : ''}`, {
        method: refresh ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${token}` }
    });
    const body = await res.json();
    return res.ok ? { report: body as InsightReport } : { error: (body?.error as string) || 'Could not load insights' };
}

async function getTrends(domainId: string) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_URL}/api/insights/${domainId}/trends`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}

export default function InsightsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [report, setReport] = useState<InsightReport | null>(null);
    const [trends, setTrends] = useState<TrendData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
    const insights = report?.insights ?? [];

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }

        const loadData = async () => {
            setLoading(true);
            setError(null);
            setSelectedInsight(null);

            const [insightsData, trendsData] = await Promise.all([
                getInsights(selectedDomainId),
                getTrends(selectedDomainId)
            ]);

            setReport(insightsData.report ?? null);
            setError(insightsData.error ?? null);
            setTrends(trendsData);
            setLoading(false);
        };

        loadData();
    }, [selectedDomainId, domainLoading]);

    const refresh = async () => {
        if (!selectedDomainId) return;
        setRefreshing(true);
        setError(null);
        const result = await getInsights(selectedDomainId, true);
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
            subtitle="A daily report on what changed on your site and what to do about it"
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

            <ChartCard title="All insights" subtitle={insights.length ? `${insights.length} from today's report` : undefined} flush>
                {insights.length === 0 ? (
                    <p className="empty-note">
                        {report?.status === 'insufficient_data'
                            ? `Not enough data yet: insights need at least ${report.minSessions} sessions in the last 7 days.`
                            : error ? 'Insights could not be loaded.' : 'No insights yet.'}
                    </p>
                ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {insights.map(insight => {
                            const Icon = insightIcons[insight.type] || Sparkles;
                            const open = selectedInsight?.id === insight.id;
                            return (
                                <li key={insight.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                                    <button
                                        type="button"
                                        aria-expanded={open}
                                        onClick={() => setSelectedInsight(open ? null : insight)}
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
                                            <Link
                                                href={insight.link}
                                                style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
                                            >
                                                See the data <ArrowRight size={14} aria-hidden="true" />
                                            </Link>
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
