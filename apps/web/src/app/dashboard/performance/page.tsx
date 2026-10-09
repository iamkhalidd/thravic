'use client';

import { useState, useEffect } from 'react';
import { Gauge, Zap, Clock, Eye, LayoutList, Timer } from 'lucide-react';
import { customEvents } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';

// Web Vitals thresholds (Google's official ranges)
const THRESHOLDS: Record<string, { good: number; poor: number; unit: string; label: string }> = {
    lcp: { good: 2500, poor: 4000, unit: 'ms', label: 'Largest contentful paint (LCP)' },
    fid: { good: 100, poor: 300, unit: 'ms', label: 'First input delay (FID)' },
    cls: { good: 0.1, poor: 0.25, unit: '', label: 'Cumulative layout shift (CLS)' },
    ttfb: { good: 800, poor: 1800, unit: 'ms', label: 'Time to first byte (TTFB)' },
    fcp: { good: 1800, poor: 3000, unit: 'ms', label: 'First contentful paint (FCP)' },
};

type Status = { rank: number; label: string; badge: string };

const NO_DATA: Status = { rank: -1, label: 'No data', badge: 'badge' };
const STATUSES: Status[] = [
    { rank: 0, label: 'Good', badge: 'badge badge-success' },
    { rank: 1, label: 'Needs improvement', badge: 'badge badge-warning' },
    { rank: 2, label: 'Poor', badge: 'badge badge-error' },
];

function getStatus(key: string, raw: number | string | null): Status {
    const value = raw === null || raw === undefined ? NaN : Number(raw);
    const t = THRESHOLDS[key];
    if (Number.isNaN(value) || !t) return NO_DATA;
    if (value <= t.good) return STATUSES[0];
    if (value <= t.poor) return STATUSES[1];
    return STATUSES[2];
}

function formatValue(key: string, raw: number | string | null): string {
    // Numbers can arrive as strings (Postgres numerics); never call methods on them blind.
    const value = raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isNaN(value)) return '—';
    const t = THRESHOLDS[key];
    if (key === 'cls') return value.toFixed(3);
    if (t?.unit === 'ms' || key === 'load') {
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

function StatusBadge({ status }: { status: Status }) {
    return <span className={status.badge} style={{ whiteSpace: 'nowrap' }}>{status.label}</span>;
}

export default function PerformancePage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const range = useApiRange();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }
        let cancelled = false;
        const load = async () => {
            if (!range.background) setLoading(true);
            const result = await customEvents.getPerformance(selectedDomainId, range.start, range.end);
            if (cancelled) return;
            setData(result.data ?? null);
            setLoadError(result.data ? null : result.error || 'Could not load performance data');
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [selectedDomainId, range, domainLoading]);

    if (!selectedDomainId && !domainLoading) {
        return (
            <div className="page-stack">
                <PageHeader title="Performance" subtitle="Core Web Vitals and page load times from real visitors" />
                <div className="card empty-note">Select a website to see its performance.</div>
            </div>
        );
    }

    const busy = loading || domainLoading;
    const m = data?.metrics || {};
    const byPage: Array<{ url: string; avg_lcp: number; avg_fcp: number; count: number }> = data?.byPage || [];
    const samples = Number(m.sample_count || 0);
    const vitals = [
        { key: 'lcp', icon: Eye, value: m.avg_lcp },
        { key: 'fid', icon: Zap, value: m.avg_fid },
        { key: 'cls', icon: LayoutList, value: m.avg_cls },
        { key: 'ttfb', icon: Clock, value: m.avg_ttfb },
        { key: 'fcp', icon: Gauge, value: m.avg_fcp },
    ];

    return (
        <div className="page-stack">
            <PageHeader
                title="Performance"
                subtitle={busy || loadError
                    ? 'Core Web Vitals and page load times from real visitors'
                    : `Core Web Vitals and page load times from ${samples.toLocaleString()} visitor sample${samples === 1 ? '' : 's'}`}
            />

            {loadError && !busy && (
                <div role="alert" className="card" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>
                    {loadError}
                </div>
            )}

            {/* Six tiles: at most three per row so they read as 3 + 3, never 5 + 1. */}
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(max(260px, calc((100% - 24px) / 3)), 1fr))' }}>
                {vitals.map(({ key, icon, value }) => {
                    const t = THRESHOLDS[key];
                    const status = getStatus(key, value);
                    return (
                        <StatCard
                            key={key}
                            label={t.label}
                            icon={icon}
                            loading={busy}
                            value={formatValue(key, value)}
                            hint={<><StatusBadge status={status} /><span>Good ≤ {key === 'cls' ? t.good : formatValue(key, t.good)}</span></>}
                        />
                    );
                })}
                <StatCard
                    label="Average page load"
                    icon={Timer}
                    loading={busy}
                    value={formatValue('load', m.avg_load_time)}
                    hint="Until the load event"
                />
            </div>

            <ChartCard title="By page" subtitle="Status from the slower of LCP and FCP" flush loading={busy}>
                {loadError ? (
                    <p className="empty-note">Performance data could not be loaded.</p>
                ) : byPage.length === 0 ? (
                    <p className="empty-note">
                        No performance data in this period. It appears once the tracking script captures Web Vitals from visitors.
                    </p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: 20 }}>Page</th>
                                    <th className="num">LCP</th>
                                    <th className="num">FCP</th>
                                    <th>Status</th>
                                    <th className="num" style={{ paddingRight: 20 }}>Samples</th>
                                </tr>
                            </thead>
                            <tbody>
                                {byPage.map((page, idx) => {
                                    const lcp = getStatus('lcp', page.avg_lcp);
                                    const fcp = getStatus('fcp', page.avg_fcp);
                                    const worst = lcp.rank >= fcp.rank ? lcp : fcp;
                                    return (
                                        <tr key={idx}>
                                            <td style={{ paddingLeft: 20, maxWidth: 360 }}>
                                                <div title={page.url} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {pathOf(page.url)}
                                                </div>
                                            </td>
                                            <td className="num">{formatValue('lcp', page.avg_lcp)}</td>
                                            <td className="num">{formatValue('fcp', page.avg_fcp)}</td>
                                            <td><StatusBadge status={worst} /></td>
                                            <td className="num muted" style={{ paddingRight: 20 }}>
                                                {Number(page.count || 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </ChartCard>
        </div>
    );
}
