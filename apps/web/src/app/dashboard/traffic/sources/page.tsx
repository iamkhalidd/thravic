'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Globe,
    TrendingUp,
    ArrowUpRight,
    ArrowDownRight,
    PieChart,
    BarChart3,
    ExternalLink
} from 'lucide-react';
import { sources } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

// Channel icons and colors
const channels = {
    direct: { label: 'Direct', color: '#6366f1' },
    organic: { label: 'Organic Search', color: '#22c55e' },
    paid: { label: 'Paid Search', color: '#f59e0b' },
    social: { label: 'Social', color: '#ec4899' },
    referral: { label: 'Referral', color: '#8b5cf6' },
    email: { label: 'Email', color: '#06b6d4' }
};

export default function TrafficSourcesPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'pie' | 'bar'>('pie');

    useEffect(() => {
        const loadData = async () => {
            if (!selectedDomainId) return;
            setLoading(true);
            const result = await sources.getOverview(selectedDomainId);
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
                <p>Please select a domain to view traffic sources</p>
            </div>
        );
    }

    const channelData = data?.channels || [];
    const totalSessions = channelData.reduce((sum: number, ch: any) => sum + ch.sessions, 0);

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
                    Traffic Sources
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    See where your visitors are coming from
                </p>
            </div>

            {/* Channel Breakdown Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 'var(--space-md)',
                marginBottom: 'var(--space-xl)'
            }}>
                {Object.entries(channels).map(([key, config]) => {
                    const channel = channelData.find((ch: any) => ch.type === key);
                    const sessions = channel?.sessions || 0;
                    const percentage = totalSessions > 0 ? ((sessions / totalSessions) * 100).toFixed(1) : 0;
                    const change = channel?.change || 0;

                    return (
                        <Link
                            key={key}
                            href={`/dashboard/traffic/sources/${key}`}
                            style={{
                                padding: 'var(--space-lg)',
                                background: 'var(--color-bg-secondary)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--color-border)',
                                textDecoration: 'none',
                                transition: 'all var(--transition-fast)'
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-sm)',
                                marginBottom: 'var(--space-md)'
                            }}>
                                <div style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: config.color
                                }} />
                                <span style={{
                                    fontSize: '0.8125rem',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    {config.label}
                                </span>
                            </div>
                            <div style={{
                                fontSize: '1.5rem',
                                fontWeight: 600,
                                color: 'var(--color-text-primary)',
                                marginBottom: 'var(--space-xs)'
                            }}>
                                {sessions.toLocaleString()}
                            </div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <span style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--color-text-tertiary)'
                                }}>
                                    {percentage}% of total
                                </span>
                                <span style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    fontSize: '0.75rem',
                                    color: change >= 0 ? 'var(--color-success)' : 'var(--color-error)'
                                }}>
                                    {change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                    {Math.abs(change)}%
                                </span>
                            </div>
                        </Link>
                    );
                })}
            </div>

            {/* Chart Section */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--space-lg)',
                marginBottom: 'var(--space-xl)'
            }}>
                {/* Pie Chart */}
                <div style={{
                    padding: 'var(--space-lg)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)'
                }}>
                    <h3 style={{
                        fontSize: '0.9375rem',
                        fontWeight: 500,
                        marginBottom: 'var(--space-lg)',
                        color: 'var(--color-text-primary)'
                    }}>
                        Channel Distribution
                    </h3>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        height: '200px'
                    }}>
                        {/* Simple pie chart visualization */}
                        <svg viewBox="0 0 100 100" style={{ width: '180px', height: '180px' }}>
                            {(() => {
                                let cumulativePercent = 0;
                                return channelData.map((ch: any, idx: number) => {
                                    const percent = totalSessions > 0 ? (ch.sessions / totalSessions) * 100 : 0;
                                    const startAngle = cumulativePercent * 3.6;
                                    cumulativePercent += percent;
                                    const endAngle = cumulativePercent * 3.6;

                                    const startX = 50 + 40 * Math.cos((startAngle - 90) * Math.PI / 180);
                                    const startY = 50 + 40 * Math.sin((startAngle - 90) * Math.PI / 180);
                                    const endX = 50 + 40 * Math.cos((endAngle - 90) * Math.PI / 180);
                                    const endY = 50 + 40 * Math.sin((endAngle - 90) * Math.PI / 180);
                                    const largeArc = percent > 50 ? 1 : 0;

                                    const color = channels[ch.type as keyof typeof channels]?.color || '#888';

                                    return (
                                        <path
                                            key={idx}
                                            d={`M 50 50 L ${startX} ${startY} A 40 40 0 ${largeArc} 1 ${endX} ${endY} Z`}
                                            fill={color}
                                            stroke="var(--color-bg-secondary)"
                                            strokeWidth="1"
                                        />
                                    );
                                });
                            })()}
                            <circle cx="50" cy="50" r="25" fill="var(--color-bg-secondary)" />
                        </svg>
                    </div>
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 'var(--space-sm)',
                        justifyContent: 'center',
                        marginTop: 'var(--space-md)'
                    }}>
                        {Object.entries(channels).map(([key, config]) => (
                            <div key={key} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.6875rem',
                                color: 'var(--color-text-secondary)'
                            }}>
                                <div style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '2px',
                                    background: config.color
                                }} />
                                {config.label}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Source Table */}
                <div style={{
                    padding: 'var(--space-lg)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)'
                }}>
                    <h3 style={{
                        fontSize: '0.9375rem',
                        fontWeight: 500,
                        marginBottom: 'var(--space-lg)',
                        color: 'var(--color-text-primary)'
                    }}>
                        Top Sources
                    </h3>
                    <table style={{ width: '100%', fontSize: '0.8125rem' }}>
                        <thead>
                            <tr style={{ color: 'var(--color-text-tertiary)' }}>
                                <th style={{ textAlign: 'left', padding: 'var(--space-xs) 0', fontWeight: 500 }}>Source</th>
                                <th style={{ textAlign: 'right', padding: 'var(--space-xs) 0', fontWeight: 500 }}>Sessions</th>
                                <th style={{ textAlign: 'right', padding: 'var(--space-xs) 0', fontWeight: 500 }}>Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(data?.topSources || []).slice(0, 8).map((source: any, idx: number) => (
                                <tr key={idx} style={{ borderTop: '1px solid var(--color-border)' }}>
                                    <td style={{
                                        padding: 'var(--space-sm) 0',
                                        color: 'var(--color-text-primary)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                                            <Globe size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                                            {source.source || 'Direct'}
                                        </div>
                                    </td>
                                    <td style={{
                                        textAlign: 'right',
                                        padding: 'var(--space-sm) 0',
                                        color: 'var(--color-text-primary)'
                                    }}>
                                        {source.sessions?.toLocaleString()}
                                    </td>
                                    <td style={{
                                        textAlign: 'right',
                                        padding: 'var(--space-sm) 0',
                                        color: (source.change || 0) >= 0 ? 'var(--color-success)' : 'var(--color-error)'
                                    }}>
                                        {(source.change || 0) >= 0 ? '+' : ''}{source.change || 0}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Quick Links */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 'var(--space-md)'
            }}>
                <Link
                    href="/dashboard/traffic/campaigns"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 'var(--space-md)',
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        textDecoration: 'none',
                        color: 'var(--color-text-primary)',
                        fontSize: '0.875rem'
                    }}
                >
                    <span>View Campaigns</span>
                    <ExternalLink size={14} />
                </Link>
                <Link
                    href="/dashboard/traffic/trends"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 'var(--space-md)',
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        textDecoration: 'none',
                        color: 'var(--color-text-primary)',
                        fontSize: '0.875rem'
                    }}
                >
                    <span>Traffic Trends</span>
                    <ExternalLink size={14} />
                </Link>
                <Link
                    href="/dashboard/reports"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 'var(--space-md)',
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        textDecoration: 'none',
                        color: 'var(--color-text-primary)',
                        fontSize: '0.875rem'
                    }}
                >
                    <span>Generate Report</span>
                    <ExternalLink size={14} />
                </Link>
            </div>
        </div>
    );
}
