'use client';

import { useState, useEffect } from 'react';
import { Gauge, Zap, Clock, Eye, LayoutList } from 'lucide-react';
import { customEvents } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

// Web Vitals thresholds (Google's official ranges)
const THRESHOLDS: Record<string, { good: number; poor: number; unit: string; label: string }> = {
    lcp: { good: 2500, poor: 4000, unit: 'ms', label: 'Largest Contentful Paint' },
    fid: { good: 100, poor: 300, unit: 'ms', label: 'First Input Delay' },
    cls: { good: 0.1, poor: 0.25, unit: '', label: 'Cumulative Layout Shift' },
    ttfb: { good: 800, poor: 1800, unit: 'ms', label: 'Time to First Byte' },
    fcp: { good: 1800, poor: 3000, unit: 'ms', label: 'First Contentful Paint' },
};

function getScore(key: string, raw: number | string | null): { color: string; label: string } {
    const value = raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isNaN(value)) return { color: 'var(--color-text-muted)', label: 'No data' };
    const t = THRESHOLDS[key];
    if (!t) return { color: 'var(--color-text-primary)', label: '' };
    if (value <= t.good) return { color: '#22c55e', label: 'Good' };
    if (value <= t.poor) return { color: '#f59e0b', label: 'Needs Work' };
    return { color: '#ef4444', label: 'Poor' };
}

function formatValue(key: string, raw: number | string | null): string {
    // Numbers can arrive as strings (Postgres numerics); never call methods on them blind.
    const value = raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isNaN(value)) return '—';
    const t = THRESHOLDS[key];
    if (key === 'cls') return value.toFixed(3);
    if (t?.unit === 'ms') {
        if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
        return `${Math.round(value)}ms`;
    }
    return String(Math.round(value));
}

// The API groups by page path ("/pricing"); older rows may still be full URLs.
function pathOf(url: string | null): string {
    if (!url) return '/';
    try {
        return new URL(url).pathname || '/';
    } catch {
        return url;
    }
}

export default function PerformancePage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            if (!selectedDomainId) return;
            setLoading(true);
            const result = await customEvents.getPerformance(selectedDomainId);
            if (result.data) setData(result.data);
            setLoading(false);
        };
        if (selectedDomainId) load();
    }, [selectedDomainId]);

    if (!selectedDomainId && !domainLoading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
                <p>Please select a domain to view performance metrics</p>
            </div>
        );
    }

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
                <p>Please select a domain to view performance metrics</p>
            </div>
        );
    }

    const m = data?.metrics || {};
    const byPage = data?.byPage || [];
    const vitals = [
        { key: 'lcp', icon: Eye, value: m.avg_lcp },
        { key: 'fid', icon: Zap, value: m.avg_fid },
        { key: 'cls', icon: LayoutList, value: m.avg_cls },
        { key: 'ttfb', icon: Clock, value: m.avg_ttfb },
        { key: 'fcp', icon: Gauge, value: m.avg_fcp },
    ];

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 'var(--space-xl)' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-xs)' }}>
                    Performance
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Core Web Vitals and page load metrics &middot; {m.sample_count || 0} samples
                </p>
            </div>

            {/* Vitals Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
                {vitals.map(({ key, icon: Icon, value }) => {
                    const score = getScore(key, value);
                    const t = THRESHOLDS[key];
                    return (
                        <div key={key} style={{
                            background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)',
                            border: '1px solid var(--color-border)', padding: 'var(--space-lg)',
                            position: 'relative', overflow: 'hidden',
                        }}>
                            {/* Score indicator bar */}
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: score.color }} />

                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
                                <Icon size={16} style={{ color: score.color }} />
                                <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {key.toUpperCase()}
                                </span>
                            </div>

                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '2px' }}>
                                {formatValue(key, value)}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.6875rem', color: score.color, fontWeight: 600 }}>{score.label}</span>
                                <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>
                                    {t ? `Good: <${formatValue(key, t.good)}` : ''}
                                </span>
                            </div>

                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-xs)' }}>
                                {t.label}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Page Load Time */}
            {m.avg_load_time != null && (
                <div style={{
                    background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)', padding: 'var(--space-lg)',
                    marginBottom: 'var(--space-xl)',
                }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-xs)' }}>
                        Average Page Load Time
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {m.avg_load_time >= 1000 ? `${(m.avg_load_time / 1000).toFixed(1)}s` : `${m.avg_load_time}ms`}
                    </div>
                </div>
            )}

            {/* Performance by Page */}
            {byPage.length > 0 && (
                <div className="dash-table-wrap" style={{ background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                    <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Performance by Page</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                        <thead>
                            <tr style={{ background: 'var(--color-bg-tertiary)' }}>
                                <th style={{ textAlign: 'left', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Page</th>
                                <th style={{ textAlign: 'right', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>LCP</th>
                                <th style={{ textAlign: 'right', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>FCP</th>
                                <th style={{ textAlign: 'right', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Samples</th>
                            </tr>
                        </thead>
                        <tbody>
                            {byPage.map((page: any, idx: number) => (
                                <tr key={idx} style={{ borderTop: '1px solid var(--color-border)' }}>
                                    <td style={{ padding: 'var(--space-md)', color: 'var(--color-text-primary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {pathOf(page.url)}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: 'var(--space-md)', color: getScore('lcp', page.avg_lcp).color, fontWeight: 500 }}>
                                        {formatValue('lcp', page.avg_lcp)}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: 'var(--space-md)', color: getScore('fcp', page.avg_fcp).color, fontWeight: 500 }}>
                                        {formatValue('fcp', page.avg_fcp)}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
                                        {page.count}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {m.sample_count === 0 && (
                <div style={{
                    background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)', padding: 'var(--space-xl)',
                    textAlign: 'center', color: 'var(--color-text-secondary)',
                }}>
                    <Gauge size={32} style={{ marginBottom: 'var(--space-sm)', opacity: 0.5 }} />
                    <p style={{ fontWeight: 500 }}>No performance data yet</p>
                    <p style={{ fontSize: '0.8125rem', marginTop: 'var(--space-xs)' }}>
                        Performance metrics will appear once the tracking script captures Web Vitals from visitors.
                    </p>
                </div>
            )}
        </div>
    );
}
