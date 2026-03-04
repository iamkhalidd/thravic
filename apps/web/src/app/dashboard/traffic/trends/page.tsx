'use client';

import { useState, useEffect } from 'react';
import {
    TrendingUp,
    TrendingDown,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    AlertTriangle,
    CheckCircle
} from 'lucide-react';
import { analytics } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

export default function TrendsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [metric, setMetric] = useState<'visitors' | 'sessions' | 'pageviews'>('visitors');

    useEffect(() => {
        const loadData = async () => {
            if (!selectedDomainId) return;
            setLoading(true);
            const result = await analytics.getDashboard(selectedDomainId);
            if (result.data) {
                setData(result.data);
            }
            setLoading(false);
        };

        if (selectedDomainId) {
            loadData();
        }
    }, [selectedDomainId]);

    if (domainLoading || loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-xl)' }}>
                <div className="loading-spinner" />
            </div>
        );
    }

    if (!selectedDomainId) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
                <p>Please select a domain to view traffic trends</p>
            </div>
        );
    }

    const chartData = data?.chart?.data || [];
    const maxValue = Math.max(...chartData.map((d: any) => d[metric] || 0), 1);

    // Calculate trend
    const halfLength = Math.floor(chartData.length / 2);
    const firstHalf = chartData.slice(0, halfLength).reduce((sum: number, d: any) => sum + (d[metric] || 0), 0);
    const secondHalf = chartData.slice(halfLength).reduce((sum: number, d: any) => sum + (d[metric] || 0), 0);
    const trendPercent = firstHalf > 0 ? (((secondHalf - firstHalf) / firstHalf) * 100).toFixed(1) : 0;
    const isPositive = Number(trendPercent) >= 0;

    return (
        <div>
            {/* Page Header */}
            <div style={{ marginBottom: 'var(--space-xl)' }}>
                <h1 style={{
                    fontSize: '1.5rem',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: 'var(--space-xs)'
                }}>
                    Traffic Trends
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Analyze traffic patterns and growth over time
                </p>
            </div>

            {/* Metric Selector */}
            <div style={{
                display: 'flex',
                gap: 'var(--space-xs)',
                marginBottom: 'var(--space-lg)'
            }}>
                {(['visitors', 'sessions', 'pageviews'] as const).map(m => (
                    <button
                        key={m}
                        onClick={() => setMetric(m)}
                        style={{
                            padding: 'var(--space-xs) var(--space-md)',
                            background: metric === m ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                            color: metric === m ? 'white' : 'var(--color-text-secondary)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            textTransform: 'capitalize'
                        }}
                    >
                        {m}
                    </button>
                ))}
            </div>

            {/* Trend Summary */}
            <div className="dash-grid-3" style={{
                marginBottom: 'var(--space-xl)'
            }}>
                <div style={{
                    padding: 'var(--space-lg)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        marginBottom: 'var(--space-sm)',
                        color: 'var(--color-text-secondary)',
                        fontSize: '0.8125rem'
                    }}>
                        <TrendingUp size={16} />
                        Current Trend
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)'
                    }}>
                        <span style={{
                            fontSize: '1.5rem',
                            fontWeight: 600,
                            color: isPositive ? 'var(--color-success)' : 'var(--color-error)'
                        }}>
                            {isPositive ? '+' : ''}{trendPercent}%
                        </span>
                        {isPositive ? (
                            <ArrowUpRight size={20} color="var(--color-success)" />
                        ) : (
                            <ArrowDownRight size={20} color="var(--color-error)" />
                        )}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                        vs first half of period
                    </span>
                </div>

                <div style={{
                    padding: 'var(--space-lg)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        marginBottom: 'var(--space-sm)',
                        color: 'var(--color-text-secondary)',
                        fontSize: '0.8125rem'
                    }}>
                        <Calendar size={16} />
                        Best Day
                    </div>
                    <div style={{
                        fontSize: '1.5rem',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)'
                    }}>
                        {chartData.length > 0
                            ? new Date(chartData.reduce((max: any, d: any) =>
                                (d[metric] || 0) > (max[metric] || 0) ? d : max
                            ).date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                            : 'N/A'
                        }
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                        highest {metric}
                    </span>
                </div>

                <div style={{
                    padding: 'var(--space-lg)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        marginBottom: 'var(--space-sm)',
                        color: 'var(--color-text-secondary)',
                        fontSize: '0.8125rem'
                    }}>
                        {isPositive ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                        Status
                    </div>
                    <div style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: isPositive ? 'var(--color-success)' : 'var(--color-warning)'
                    }}>
                        {isPositive ? 'Growing' : 'Declining'}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                        {isPositive ? 'Traffic is increasing' : 'Consider reviewing sources'}
                    </span>
                </div>
            </div>

            {/* Chart */}
            <div style={{
                padding: 'var(--space-lg)',
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                marginBottom: 'var(--space-xl)'
            }}>
                <h3 style={{
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    marginBottom: 'var(--space-lg)',
                    color: 'var(--color-text-primary)',
                    textTransform: 'capitalize'
                }}>
                    {metric} Over Time
                </h3>

                <div style={{ height: '250px', display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                    {chartData.map((d: any, idx: number) => {
                        const value = d[metric] || 0;
                        const height = (value / maxValue) * 100;
                        return (
                            <div
                                key={idx}
                                style={{
                                    flex: 1,
                                    height: `${height}%`,
                                    minHeight: '2px',
                                    background: `linear-gradient(180deg, var(--color-primary) 0%, var(--color-primary-dark, #4f46e5) 100%)`,
                                    borderRadius: '2px 2px 0 0',
                                    position: 'relative'
                                }}
                                title={`${new Date(d.date).toLocaleDateString()}: ${value.toLocaleString()} ${metric}`}
                            />
                        );
                    })}
                </div>

                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 'var(--space-sm)',
                    fontSize: '0.6875rem',
                    color: 'var(--color-text-tertiary)'
                }}>
                    {chartData.length > 0 && (
                        <>
                            <span>{new Date(chartData[0]?.date).toLocaleDateString()}</span>
                            <span>{new Date(chartData[chartData.length - 1]?.date).toLocaleDateString()}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Annotations / Insights */}
            <div style={{
                padding: 'var(--space-lg)',
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)'
            }}>
                <h3 style={{
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    marginBottom: 'var(--space-md)',
                    color: 'var(--color-text-primary)'
                }}>
                    Traffic Insights
                </h3>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-sm)'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        padding: 'var(--space-sm)',
                        background: 'var(--color-bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.8125rem'
                    }}>
                        {isPositive ? (
                            <CheckCircle size={16} color="var(--color-success)" />
                        ) : (
                            <AlertTriangle size={16} color="var(--color-warning)" />
                        )}
                        <span style={{ color: 'var(--color-text-primary)' }}>
                            {isPositive
                                ? `Traffic is trending up by ${trendPercent}% over the selected period.`
                                : `Traffic has decreased by ${Math.abs(Number(trendPercent))}%. Review traffic sources.`
                            }
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
