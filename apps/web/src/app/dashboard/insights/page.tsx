'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Sparkles,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Target,
    Zap,
    ArrowRight,
    RefreshCw,
    ChevronRight,
    FileText,
    Filter,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useDomain } from '@/contexts/DomainContext';

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

const priorityColors: Record<string, string> = {
    high: 'var(--color-error)',
    medium: 'var(--color-warning)',
    low: 'var(--color-success)'
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

    // Combine historical and forecast for chart
    const chartData = trends ? [
        ...trends.historical.map(h => ({
            date: h.date,
            pageviews: h.pageviews,
            trendLine: h.pageviewsMA,
            type: 'historical'
        })),
        ...trends.forecast.map(f => ({
            date: f.date,
            forecast: f.predicted,
            confidence: f.confidence,
            type: 'forecast'
        }))
    ] : [];

    if (loading) {
        return (
            <div>
                <div className="skeleton" style={{ height: '40px', width: '200px', marginBottom: 'var(--space-xl)' }} />
                <div className="grid grid-cols-3 gap-lg">
                    <div style={{ gridColumn: 'span 2' }} className="card">
                        <div className="skeleton" style={{ height: '300px' }} />
                    </div>
                    <div className="card">
                        <div className="skeleton" style={{ height: '300px' }} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-xl)' }}>
                <div className="flex items-center gap-md">
                    <h1>AI Insights</h1>
                    <span className="badge" style={{ background: 'var(--color-accent-gradient)' }}>
                        <Sparkles size={12} style={{ marginRight: '4px' }} />
                        {insights.length} insights
                    </span>
                    {report && report.status === 'ok' && (
                        <span className="badge" title={report.aiGenerated ? 'Written by AI from your numbers' : 'AI unavailable: written by rules from the same numbers'}>
                            {report.aiGenerated ? 'AI' : 'Rule-based'}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-md">
                    {report && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            Updated {new Date(report.generatedAt).toLocaleString()} · {report.refreshesLeft} refresh{report.refreshesLeft === 1 ? '' : 'es'} left today
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
                </div>
            </div>

            {error && (
                <div role="alert" className="card" style={{ marginBottom: 'var(--space-lg)', color: 'var(--color-error)' }}>
                    {error}
                </div>
            )}

            <div className="grid grid-cols-3 gap-lg" style={{ marginBottom: 'var(--space-xl)' }}>
                {/* Traffic Forecast Chart */}
                <div style={{ gridColumn: 'span 2' }} className="card">
                    <div className="card-header" style={{ marginBottom: 'var(--space-md)' }}>
                        <h4 className="card-title">Traffic Forecast</h4>
                        {trends?.trend && (
                            <div className="flex items-center gap-sm">
                                {trends.trend.direction === 'up' ? (
                                    <TrendingUp size={18} style={{ color: 'var(--color-success)' }} />
                                ) : trends.trend.direction === 'down' ? (
                                    <TrendingDown size={18} style={{ color: 'var(--color-error)' }} />
                                ) : (
                                    <ArrowRight size={18} style={{ color: 'var(--color-text-muted)' }} />
                                )}
                                <span style={{ fontSize: '0.875rem', textTransform: 'capitalize' }}>
                                    {trends.trend.direction} trend
                                </span>
                            </div>
                        )}
                    </div>

                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                                <XAxis
                                    dataKey="date"
                                    stroke="var(--color-text-muted)"
                                    fontSize={12}
                                    tickFormatter={(value) => {
                                        const date = new Date(value);
                                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                    }}
                                />
                                <YAxis
                                    stroke="var(--color-text-muted)"
                                    fontSize={12}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--color-bg-card)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)'
                                    }}
                                />
                                {/* Today marker */}
                                {trends?.historical.length && (
                                    <ReferenceLine
                                        x={trends.historical[trends.historical.length - 1].date}
                                        stroke="var(--color-text-muted)"
                                        strokeDasharray="3 3"
                                        label={{ value: 'Today', position: 'top', fontSize: 10 }}
                                    />
                                )}
                                <Line
                                    type="monotone"
                                    dataKey="pageviews"
                                    stroke="var(--color-accent-primary)"
                                    strokeWidth={2}
                                    dot={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="trendLine"
                                    stroke="var(--color-accent-secondary)"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="forecast"
                                    stroke="var(--color-success)"
                                    strokeWidth={2}
                                    strokeDasharray="3 3"
                                    dot={{ fill: 'var(--color-success)', r: 3 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="flex items-center justify-center gap-lg" style={{ marginTop: 'var(--space-md)' }}>
                        <div className="flex items-center gap-xs">
                            <span style={{ width: '20px', height: '3px', background: 'var(--color-accent-primary)' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Actual</span>
                        </div>
                        <div className="flex items-center gap-xs">
                            <span style={{ width: '20px', height: '3px', background: 'var(--color-accent-secondary)', borderStyle: 'dashed' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Trend</span>
                        </div>
                        <div className="flex items-center gap-xs">
                            <span style={{ width: '20px', height: '3px', background: 'var(--color-success)', borderStyle: 'dashed' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Forecast</span>
                        </div>
                    </div>
                </div>

                {/* Quick Stats */}
                <div>
                    <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
                        <h5 style={{ marginBottom: 'var(--space-md)' }}>Insight Summary</h5>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                            <div className="flex items-center justify-between">
                                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>High Priority</span>
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: 'var(--radius-full)',
                                    background: 'rgba(239, 68, 68, 0.2)',
                                    color: 'var(--color-error)',
                                    fontSize: '0.875rem',
                                    fontWeight: 600
                                }}>
                                    {insights.filter(i => i.priority === 'high').length}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Medium Priority</span>
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: 'var(--radius-full)',
                                    background: 'rgba(245, 158, 11, 0.2)',
                                    color: 'var(--color-warning)',
                                    fontSize: '0.875rem',
                                    fontWeight: 600
                                }}>
                                    {insights.filter(i => i.priority === 'medium').length}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Low Priority</span>
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: 'var(--radius-full)',
                                    background: 'rgba(16, 185, 129, 0.2)',
                                    color: 'var(--color-success)',
                                    fontSize: '0.875rem',
                                    fontWeight: 600
                                }}>
                                    {insights.filter(i => i.priority === 'low').length}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 7-Day Forecast */}
                    {trends?.forecast && trends.forecast.length > 0 && (
                        <div className="card">
                            <h5 style={{ marginBottom: 'var(--space-md)' }}>7-Day Forecast</h5>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                                {trends.forecast.slice(0, 5).map((f, i) => (
                                    <div key={i} className="flex items-center justify-between" style={{ fontSize: '0.875rem' }}>
                                        <span style={{ color: 'var(--color-text-secondary)' }}>
                                            {new Date(f.date).toLocaleDateString('en-US', { weekday: 'short' })}
                                        </span>
                                        <span>{f.predicted} views</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Insights List */}
            <div className="card">
                <div className="card-header" style={{ marginBottom: 'var(--space-lg)' }}>
                    <h4 className="card-title">All Insights</h4>
                </div>

                {insights.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-muted)' }}>
                        <Sparkles size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                        <p>
                            {report?.status === 'insufficient_data'
                                ? `Not enough data yet: insights need at least ${report.minSessions} sessions in the last 7 days.`
                                : 'No insights yet.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                        {insights.map(insight => {
                            const Icon = insightIcons[insight.type] || Sparkles;

                            return (
                                <div
                                    key={insight.id}
                                    onClick={() => setSelectedInsight(selectedInsight?.id === insight.id ? null : insight)}
                                    style={{
                                        padding: 'var(--space-md)',
                                        background: 'var(--color-bg-secondary)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--color-border)',
                                        cursor: 'pointer',
                                        transition: 'border-color var(--transition-fast)'
                                    }}
                                >
                                    <div className="flex items-start gap-md">
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: 'var(--radius-md)',
                                            background: `${priorityColors[insight.priority]}20`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            <Icon size={20} style={{ color: priorityColors[insight.priority] }} />
                                        </div>

                                        <div style={{ flex: 1 }}>
                                            <div className="flex items-center gap-sm" style={{ marginBottom: 'var(--space-xs)' }}>
                                                <h5 style={{ margin: 0 }}>{insight.title}</h5>
                                                <span className="badge" style={{
                                                    textTransform: 'capitalize',
                                                    background: `${priorityColors[insight.priority]}20`,
                                                    color: priorityColors[insight.priority]
                                                }}>
                                                    {insight.priority}
                                                </span>
                                            </div>
                                            <p style={{
                                                fontSize: '0.875rem',
                                                color: 'var(--color-text-secondary)',
                                                marginBottom: selectedInsight?.id === insight.id ? 'var(--space-md)' : 0
                                            }}>
                                                {insight.description}
                                            </p>

                                            {selectedInsight?.id === insight.id && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                                                    {insight.recommendation && (
                                                        <div style={{
                                                            padding: 'var(--space-sm) var(--space-md)',
                                                            background: 'var(--color-bg-tertiary)',
                                                            borderRadius: 'var(--radius-md)',
                                                            borderLeft: '3px solid var(--color-accent-primary)'
                                                        }}>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                                Recommendation
                                                            </span>
                                                            <p style={{ fontSize: '0.875rem', margin: 'var(--space-xs) 0 0' }}>
                                                                {insight.recommendation}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {insight.evidence.map(item => (
                                                        <div key={item.subject} style={{ fontSize: '0.8rem' }}>
                                                            <div style={{ color: 'var(--color-text-muted)', marginBottom: 4 }}>
                                                                Based on: {item.subject}
                                                            </div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs) var(--space-md)' }}>
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
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                    >
                                                        See the data <ArrowRight size={14} />
                                                    </Link>
                                                </div>
                                            )}
                                        </div>

                                        <ChevronRight
                                            size={18}
                                            style={{
                                                color: 'var(--color-text-muted)',
                                                transform: selectedInsight?.id === insight.id ? 'rotate(90deg)' : 'none',
                                                transition: 'transform var(--transition-fast)'
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
