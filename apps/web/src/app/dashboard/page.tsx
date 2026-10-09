'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Users,
    Eye,
    Clock,
    Globe,
    RefreshCw,
    MousePointer2,
    BarChart3,
    Plus,
    Copy,
    Check,
    Target,
    Video,
    Sparkles,
    Code,
    ExternalLink,
    X,
    Activity,
} from 'lucide-react';
import { analytics, domains } from '@/lib/api';
import type { Metrics, TopPage, TimeseriesData, RealtimeData } from '@/types';
import { ScriptInstallation } from '@/components/ScriptInstallation';
import { AppInstallation } from '@/components/AppInstallation';
import { isApp } from '@/lib/platform';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { BarList } from '@/components/charts/BarList';
import { duration } from '@/components/charts/format';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';

// Fallback when the script request fails; the API normally supplies the snippet.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const SOURCE_LABELS: Array<[string, string]> = [
    ['organic', 'Organic search'], ['social', 'Social'], ['direct', 'Direct'],
    ['referral', 'Referral'], ['email', 'Email'], ['paid', 'Paid'],
];

/** Percentage change, or undefined without a previous value to compare with. */
function change(now?: number, before?: number): number | undefined {
    if (now === undefined || before === undefined || before === 0) return undefined;
    return ((now - before) / before) * 100;
}

export default function DashboardPage() {
    // The site and the date range come from the sidebar switcher and the header
    // picker, like every other page.
    const { domains: domainList, selectedDomainId, selectedDomain, loading: domainsLoading } = useDomain();
    const range = useApiRange();
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [previous, setPrevious] = useState<Metrics | null>(null);
    const [topPages, setTopPages] = useState<TopPage[]>([]);
    const [timeseries, setTimeseries] = useState<TimeseriesData[]>([]);
    const [previousSeries, setPreviousSeries] = useState<TimeseriesData[]>([]);
    const [realtime, setRealtime] = useState<RealtimeData | null>(null);
    const [sourceData, setSourceData] = useState<{ label: string; value: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [trackingScript, setTrackingScript] = useState('');
    const [showInstructions, setShowInstructions] = useState(false);
    // An app's overview: screens for pages, and versions where a site shows its sources.
    const app = isApp(selectedDomain);
    const [versionData, setVersionData] = useState<{ label: string; value: number }[]>([]);

    useEffect(() => {
        if (!selectedDomainId) return;
        domains.getScript(selectedDomainId).then(res => {
            if (res.data) setTrackingScript(res.data.script);
        });
    }, [selectedDomainId]);

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainsLoading) setLoading(false);
            return;
        }
        let cancelled = false;

        const loadData = async () => {
            if (!range.background) setLoading(true);
            const { start, end, compare } = range;
            const [overviewRes, timeseriesRes, realtimeRes, sourcesRes, prevOverview, prevSeries, devicesRes] = await Promise.all([
                analytics.getOverview(selectedDomainId, start, end),
                analytics.getTimeseries(selectedDomainId, start, end),
                analytics.getRealtime(selectedDomainId),
                app ? null : analytics.getSources(selectedDomainId, start, end),
                compare ? analytics.getOverview(selectedDomainId, compare.start, compare.end) : null,
                compare ? analytics.getTimeseries(selectedDomainId, compare.start, compare.end) : null,
                app ? analytics.getDevices(selectedDomainId, start, end) : null,
            ]);
            if (cancelled) return;

            setMetrics(overviewRes.data?.metrics ?? null);
            setTopPages(overviewRes.data?.topPages ?? []);
            setTimeseries(timeseriesRes.data?.data ?? []);
            setRealtime(realtimeRes.data ?? null);
            setPrevious(prevOverview?.data?.metrics ?? null);
            setPreviousSeries(prevSeries?.data?.data ?? []);
            const byType = sourcesRes?.data?.byType as Record<string, number> | undefined;
            setSourceData(byType ? SOURCE_LABELS.map(([key, label]) => ({ label, value: byType[key] || 0 })) : []);
            setVersionData((devicesRes?.data?.appVersions ?? []).map(v => ({ label: v.name, value: v.sessions })));
            setLoading(false);
        };

        loadData();
        const interval = setInterval(async () => {
            const result = await analytics.getRealtime(selectedDomainId);
            if (result.data && !cancelled) setRealtime(result.data);
        }, 30000);

        return () => { cancelled = true; clearInterval(interval); };
    }, [selectedDomainId, range, domainsLoading, app]);

    const handleCopyScript = () => {
        navigator.clipboard.writeText(trackingScript);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Loading state
    if ((loading || domainsLoading) && (domainList.length > 0 || domainsLoading)) {
        return (
            <div className="page-stack">
                <div className="skeleton" style={{ height: '28px', width: '180px' }} />
                <div className="stat-grid">
                    {[1, 2, 3, 4, 5].map(i => <StatCard key={i} label="" value="" loading />)}
                </div>
                <div className="card"><div className="skeleton" style={{ height: '260px' }} /></div>
            </div>
        );
    }

    // No domains - show onboarding
    if (domainList.length === 0) {
        return (
            <div>
                <h1 style={{ marginBottom: 'var(--space-xl)' }}>Welcome to Thravic!</h1>

                {/* Getting Started Card */}
                <div className="card" style={{ padding: 'var(--space-2xl)', textAlign: 'center', marginBottom: 'var(--space-xl)', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '24px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--color-border)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto var(--space-lg)'
                    }}>
                        <Globe size={32} color="var(--color-text-primary)" />
                    </div>
                    <h2 style={{ marginBottom: 'var(--space-sm)' }}>Add your first website</h2>
                    <p style={{ marginBottom: 'var(--space-xl)', color: 'var(--color-text-secondary)', maxWidth: '500px', margin: '0 auto var(--space-xl)' }}>
                        Get started by adding your website. We&apos;ll generate a tracking script you can install in minutes.
                    </p>
                    <Link href="/dashboard/domains/new" className="btn btn-primary" style={{ padding: 'var(--space-md) var(--space-xl)' }}>
                        <Plus size={20} />
                        Add Website
                    </Link>
                </div>

                {/* Quick Features Overview */}
                <h3 style={{ marginBottom: 'var(--space-lg)' }}>What you&apos;ll get</h3>
                <div className="grid grid-cols-3 gap-lg">
                    {[
                        { icon: BarChart3, title: 'Real-time Analytics', desc: 'See visitors, pageviews, and engagement as it happens' },
                        { icon: Target, title: 'Funnel Tracking', desc: 'Track conversion paths and identify drop-offs' },
                        { icon: MousePointer2, title: 'Heatmaps', desc: 'Visualize where users click and scroll' },
                        { icon: Video, title: 'Session Recordings', desc: 'Watch how visitors interact with your site' },
                        { icon: Sparkles, title: 'AI Insights', desc: 'Get automated recommendations to improve' },
                        { icon: Globe, title: 'Traffic Sources', desc: 'Know where your visitors come from' }
                    ].map((feature, i) => (
                        <div key={i} className="card" style={{ background: 'var(--color-bg-card)', padding: 'var(--space-lg)', borderRadius: '16px' }}>
                            <feature.icon size={20} style={{ color: 'var(--color-text-primary)', marginBottom: 'var(--space-md)' }} />
                            <h4 style={{ marginBottom: 'var(--space-xs)', fontSize: '0.9375rem', fontWeight: 500 }}>{feature.title}</h4>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>{feature.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const hasData = metrics && (metrics.pageviews > 0 || metrics.uniqueVisitors > 0);
    const comparing = !!range.compare;

    // The previous period, aligned day by day, as a dashed comparison line.
    const chartData = timeseries.map((row, i) => ({
        ...row,
        ...(comparing ? { previousVisitors: previousSeries[i]?.visitors ?? null } : {}),
    }));

    return (
        <div className="page-stack">
            <PageHeader
                title="Overview"
                subtitle={selectedDomain?.domain}
                badge={
                    <span title="Visitors in the last 5 minutes" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 6,
                        padding: '2px 10px', borderRadius: 999, border: '1px solid var(--color-border)',
                        fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)',
                    }}>
                        <span aria-hidden="true" style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: realtime?.activeVisitors ? 'var(--color-success)' : 'var(--color-text-muted)',
                        }} />
                        {realtime?.activeVisitors || 0} online
                    </span>
                }
            />

            {/* No data yet - show tracking code */}
            {!hasData && (
                <div className="card" style={{ borderColor: 'var(--color-warning)', background: 'rgba(245, 158, 11, 0.05)' }}>
                    <div className="flex items-start gap-md">
                        <Code size={20} aria-hidden="true" style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h2 className="card-title">{app ? 'Install the SDK' : 'Install your tracking script'}</h2>
                            <p className="card-subtitle" style={{ marginBottom: 12 }}>
                                {app
                                    ? <>Run <code>npm install @thravic/react-native</code>, then add this where your app starts.</>
                                    : <>Add this to the <code>&lt;head&gt;</code> of your website to start collecting data.</>}
                            </p>
                            <div style={{
                                position: 'relative', background: 'var(--color-bg-primary)',
                                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                                padding: '12px 96px 12px 12px', marginBottom: 12,
                            }}>
                                <pre style={{ margin: 0, fontSize: '0.75rem', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    {trackingScript || `<script async src="${API_URL}/tf.js" data-tracking-id="${selectedDomain?.trackingId}"></script>`}
                                </pre>
                                <button onClick={handleCopyScript} className="btn btn-secondary" style={{ position: 'absolute', top: 8, right: 8, padding: '4px 10px' }}>
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            <button onClick={() => setShowInstructions(true)} className="btn btn-primary">
                                <ExternalLink size={16} />
                                Installation guide
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Instruction Modal */}
            {showInstructions && selectedDomain && (
                <div role="dialog" aria-modal="true" aria-label={app ? 'Install the SDK' : 'Install tracking script'} style={{
                    position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 'var(--space-md)',
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', padding: 'var(--space-xl)' }}>
                        <button onClick={() => setShowInstructions(false)} aria-label="Close" style={{
                            position: 'absolute', top: 'var(--space-md)', right: 'var(--space-md)',
                            background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)',
                        }}>
                            <X size={20} />
                        </button>
                        <h2 style={{ marginBottom: 'var(--space-xs)' }}>{app ? 'Install the SDK' : 'Install tracking script'}</h2>
                        <p style={{ marginBottom: 'var(--space-lg)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                            {app ? 'Pick how your app is built and follow the steps.' : 'Select your platform below and follow the steps to install Thravic.'}
                        </p>
                        {app
                            ? <AppInstallation init={trackingScript} />
                            : <ScriptInstallation script={trackingScript || `<script async src="${API_URL}/tf.js" data-tracking-id="${selectedDomain.trackingId}"></script>`} />}
                        <div style={{ marginTop: 'var(--space-xl)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
                            <button onClick={() => setShowInstructions(false)} className="btn btn-secondary">Close</button>
                            <button
                                onClick={async () => {
                                    const result = await domains.verify(selectedDomain.id);
                                    if (result.data?.verified) {
                                        setShowInstructions(false);
                                        window.location.reload();
                                    } else {
                                        alert((result.data as any)?.message || (app ? 'No data from your app yet.' : 'Script not detected. Please verify your installation.'));
                                    }
                                }}
                                className="btn btn-primary"
                            >
                                <RefreshCw size={16} /> Verify installation
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="stat-grid">
                <StatCard label="Visitors" icon={Users} value={(metrics?.uniqueVisitors ?? 0).toLocaleString()}
                    change={change(metrics?.uniqueVisitors, previous?.uniqueVisitors)} />
                <StatCard label={app ? 'Screen views' : 'Pageviews'} icon={Eye} value={(metrics?.pageviews ?? 0).toLocaleString()}
                    change={change(metrics?.pageviews, previous?.pageviews)} />
                <StatCard label="Sessions" icon={Activity} value={(metrics?.sessions ?? 0).toLocaleString()}
                    change={change(metrics?.sessions, previous?.sessions)} />
                <StatCard label="Bounce rate" icon={MousePointer2} value={`${Number(metrics?.bounceRate ?? 0).toFixed(1)}%`}
                    change={change(metrics?.bounceRate, previous?.bounceRate)} lowerIsBetter />
                <StatCard label="Avg. session" icon={Clock} value={duration(metrics?.avgSessionDuration ?? 0)}
                    change={change(metrics?.avgSessionDuration, previous?.avgSessionDuration)} />
            </div>

            <div className="split-grid">
                <ChartCard title="Traffic" subtitle={app ? 'Users and screen views per day' : 'Visitors and pageviews per day'}>
                    <TimeSeriesChart
                        data={chartData}
                        xKey="date"
                        height={260}
                        series={[
                            { key: 'visitors', label: 'Visitors' },
                            { key: 'pageviews', label: app ? 'Screen views' : 'Pageviews' },
                            ...(comparing ? [{ key: 'previousVisitors', label: 'Visitors, previous period', muted: true }] : []),
                        ]}
                    />
                </ChartCard>
                {app ? (
                    <ChartCard
                        title="Versions"
                        subtitle="Sessions by app version"
                        action={<Link href="/dashboard/behavior/versions" className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '0.8125rem' }}>Details</Link>}
                    >
                        <BarList items={versionData} emptyText="No sessions in this period" />
                    </ChartCard>
                ) : (
                    <ChartCard
                        title="Sources"
                        subtitle="Sessions by channel"
                        action={<Link href="/dashboard/traffic/sources" className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '0.8125rem' }}>Details</Link>}
                    >
                        <BarList items={sourceData} emptyText="No sessions in this period" />
                    </ChartCard>
                )}
            </div>

            <div className="split-grid">
                <ChartCard
                    title={app ? 'Top screens' : 'Top pages'}
                    subtitle={app ? 'Screen views' : 'Pageviews'}
                    action={<Link href="/dashboard/behavior/pages" className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '0.8125rem' }}>{app ? 'All screens' : 'All pages'}</Link>}
                >
                    <BarList items={topPages.map(p => ({ label: p.path, value: p.views }))} emptyText={app ? 'No screen views in this period' : 'No pageviews in this period'} />
                </ChartCard>
                <ChartCard title="Right now" subtitle="Visitors in the last 5 minutes">
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                        <span className="stat-value" style={{ fontSize: '2rem' }}>{realtime?.activeVisitors || 0}</span>
                        <span className="stat-hint">
                            {realtime?.pageviewsLast30Min ?? 0} {app ? 'screen views' : 'pageviews'} in the last 30 minutes
                        </span>
                    </div>
                    <BarList
                        items={(realtime?.activePages ?? []).map(p => ({ label: p.path, value: p.count }))}
                        limit={5}
                        showShare={false}
                        emptyText={app ? 'Nobody is in the app right now' : 'Nobody is on the site right now'}
                    />
                </ChartCard>
            </div>
        </div>
    );
}
