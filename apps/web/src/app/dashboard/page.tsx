'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Users,
    Eye,
    Clock,
    TrendingUp,
    TrendingDown,
    Globe,
    RefreshCw,
    MousePointer2,
    BarChart3,
    Plus,
    Copy,
    Check,
    ArrowRight,
    Target,
    Video,
    Sparkles,
    CreditCard,
    Code,
    ExternalLink,
    X
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { analytics, domains } from '@/lib/api';
import type { Metrics, TopPage, TimeseriesData, RealtimeData, Domain } from '@/types';
import { ScriptInstallation } from '@/components/ScriptInstallation';

const sourceColors = ['#f4f5f6', '#d1d5db', '#8a8f98', '#575c66', '#3f434a', '#2d3036'];

export default function DashboardPage() {
    const [domainList, setDomainList] = useState<Domain[]>([]);
    const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
    const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [topPages, setTopPages] = useState<TopPage[]>([]);
    const [timeseries, setTimeseries] = useState<TimeseriesData[]>([]);
    const [realtime, setRealtime] = useState<RealtimeData | null>(null);
    const [sourceData, setSourceData] = useState<{ type: string; count: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('7d');
    const [copied, setCopied] = useState(false);
    const [trackingScript, setTrackingScript] = useState('');
    const [showInstructions, setShowInstructions] = useState(false);

    useEffect(() => {
        domains.list().then(result => {
            if (result.data && result.data.domains.length > 0) {
                const allDomains = result.data.domains;
                setDomainList(allDomains);
                const firstDomain = allDomains[0];
                setSelectedDomainId(firstDomain.id);
                setSelectedDomain(firstDomain);

                // Get tracking script
                domains.getScript(firstDomain.id).then(scriptRes => {
                    if (scriptRes.data) {
                        setTrackingScript(scriptRes.data.script);
                    }
                });
            } else {
                setDomainList([]);
                setLoading(false);
            }
        });
    }, []);

    useEffect(() => {
        if (!selectedDomainId) return;

        const loadData = async () => {
            setLoading(true);

            const days = parseInt(dateRange.replace('d', ''));
            const end = new Date().toISOString();
            const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

            const [overviewRes, timeseriesRes, realtimeRes, sourcesRes] = await Promise.all([
                analytics.getOverview(selectedDomainId, start, end),
                analytics.getTimeseries(selectedDomainId, start, end),
                analytics.getRealtime(selectedDomainId),
                analytics.getSources(selectedDomainId, start, end)
            ]);

            if (overviewRes.data) {
                setMetrics(overviewRes.data.metrics);
                setTopPages(overviewRes.data.topPages);
            }

            if (timeseriesRes.data) {
                setTimeseries(timeseriesRes.data.data);
            }

            if (realtimeRes.data) {
                setRealtime(realtimeRes.data);
            }

            if (sourcesRes.data) {
                const byType = sourcesRes.data.byType;
                setSourceData([
                    { type: 'Direct', count: byType.direct },
                    { type: 'Organic', count: byType.organic },
                    { type: 'Social', count: byType.social },
                    { type: 'Referral', count: byType.referral },
                    { type: 'Paid', count: byType.paid },
                    { type: 'Email', count: byType.email }
                ].filter(s => s.count > 0));
            }

            setLoading(false);
        };

        loadData();

        const interval = setInterval(async () => {
            const result = await analytics.getRealtime(selectedDomainId);
            if (result.data) {
                setRealtime(result.data);
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [selectedDomainId, dateRange]);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    const handleCopyScript = () => {
        navigator.clipboard.writeText(trackingScript);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Loading state
    if (loading && domainList.length > 0) {
        return (
            <div>
                <div className="skeleton" style={{ height: '40px', width: '200px', marginBottom: 'var(--space-xl)' }} />
                <div className="grid grid-cols-4 gap-md" style={{ marginBottom: 'var(--space-xl)' }}>
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="card">
                            <div className="skeleton" style={{ height: '20px', width: '60%', marginBottom: 'var(--space-sm)' }} />
                            <div className="skeleton" style={{ height: '36px', width: '40%' }} />
                        </div>
                    ))}
                </div>
                <div className="card">
                    <div className="skeleton" style={{ height: '300px' }} />
                </div>
            </div>
        );
    }

    // No domains - show onboarding
    if (domainList.length === 0) {
        return (
            <div>
                <h1 style={{ marginBottom: 'var(--space-xl)' }}>Welcome to TrackFlow! 👋</h1>

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

    const statCards = [
        { label: 'Total Pageviews', value: metrics?.pageviews.toLocaleString() || '0', icon: BarChart3 },
        { label: 'Unique Visitors', value: metrics?.uniqueVisitors.toLocaleString() || '0', icon: Users },
        { label: 'Bounce Rate', value: `${metrics?.bounceRate || 0}%`, icon: MousePointer2 },
        { label: 'Avg. Session', value: formatDuration(metrics?.avgSessionDuration || 0), icon: Clock }
    ];

    const pieData = sourceData.map((s, i) => ({
        name: s.type,
        value: s.count,
        color: sourceColors[i % sourceColors.length]
    }));

    const hasData = metrics && (metrics.pageviews > 0 || metrics.uniqueVisitors > 0);

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-xl)' }}>
                <div className="flex items-center gap-md">
                    <h1>Dashboard</h1>
                    {/* Real-time indicator */}
                    <div className="flex items-center gap-sm" style={{
                        padding: 'var(--space-xs) var(--space-sm)',
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        borderRadius: '12px'
                    }}>
                        <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: realtime?.activeVisitors ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                            animation: realtime?.activeVisitors ? 'pulse 2s infinite' : 'none',
                            boxShadow: realtime?.activeVisitors ? '0 0 8px rgba(255,255,255,0.4)' : 'none'
                        }} />
                        <span style={{ fontSize: '0.875rem' }}>
                            <strong>{realtime?.activeVisitors || 0}</strong> active now
                        </span>
                    </div>
                </div>

                <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="input"
                    style={{ width: 'auto' }}
                >
                    <option value="7d">Last 7 days</option>
                    <option value="14d">Last 14 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                </select>
            </div>

            {/* No data yet - show tracking code */}
            {!hasData && (
                <div className="card" style={{ marginBottom: 'var(--space-xl)', border: '1px solid var(--color-warning)', background: 'rgba(245, 158, 11, 0.05)' }}>
                    <div className="flex items-start gap-lg">
                        <div style={{
                            padding: 'var(--space-md)',
                            background: 'rgba(245, 158, 11, 0.1)',
                            borderRadius: 'var(--radius-md)'
                        }}>
                            <Code size={24} style={{ color: 'var(--color-warning)' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ marginBottom: 'var(--space-sm)' }}>Install your tracking script</h3>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
                                Add this script to the <code>&lt;head&gt;</code> section of your website to start collecting analytics data.
                            </p>

                            <div style={{
                                position: 'relative',
                                background: 'var(--color-bg-primary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-md)',
                                marginBottom: 'var(--space-md)'
                            }}>
                                <pre style={{
                                    margin: 0,
                                    fontSize: '0.75rem',
                                    fontFamily: 'var(--font-mono)',
                                    overflow: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all'
                                }}>
                                    {trackingScript || `<script src="https://your-api.com/tf.js" data-tracking-id="${selectedDomain?.trackingId}"></script>`}
                                </pre>
                                <button
                                    onClick={handleCopyScript}
                                    className="btn btn-secondary"
                                    style={{
                                        position: 'absolute',
                                        top: 'var(--space-sm)',
                                        right: 'var(--space-sm)',
                                        padding: 'var(--space-xs) var(--space-sm)'
                                    }}
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>

                            <div className="flex gap-sm">
                                <button onClick={() => setShowInstructions(true)} className="btn btn-primary">
                                    <ExternalLink size={16} />
                                    View Full Instructions
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Instruction Modal */}
            {showInstructions && selectedDomain && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 100,
                    padding: 'var(--space-md)'
                }}>
                    <div className="card" style={{
                        width: '100%',
                        maxWidth: '700px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        position: 'relative',
                        padding: 'var(--space-xl)'
                    }}>
                        <button
                            onClick={() => setShowInstructions(false)}
                            style={{
                                position: 'absolute',
                                top: 'var(--space-md)',
                                right: 'var(--space-md)',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--color-text-muted)'
                            }}
                        >
                            <X size={20} />
                        </button>

                        <h2 style={{ marginBottom: 'var(--space-xs)' }}>Install tracking script</h2>
                        <p style={{ marginBottom: 'var(--space-lg)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                            Select your platform below and follow the steps to install TrackFlow.
                        </p>

                        <ScriptInstallation script={trackingScript || `<script async src="https://trackflow-api.onrender.com/tf.js" data-tracking-id="${selectedDomain.trackingId}"></script>`} />

                        <div style={{ marginTop: 'var(--space-xl)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
                            <button onClick={() => setShowInstructions(false)} className="btn btn-secondary">
                                Close
                            </button>
                            <button
                                onClick={async () => {
                                    // Trigger a fresh domain verify check
                                    const result = await domains.verify(selectedDomain.id);
                                    if (result.data?.verified) {
                                        setShowInstructions(false);
                                        window.location.reload();
                                    } else {
                                        alert((result.data as any)?.message || 'Script not detected. Please verify your installation.');
                                    }
                                }}
                                className="btn btn-primary"
                            >
                                <RefreshCw size={16} /> Verify Installation
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-md" style={{ marginBottom: 'var(--space-xl)' }}>
                {statCards.map((stat, i) => (
                    <div key={i} style={{ 
                        background: 'transparent', border: '1px solid var(--color-border)', 
                        borderRadius: '6px', padding: '16px', position: 'relative'
                    }}>
                        <div className="flex items-center gap-sm" style={{ marginBottom: 'var(--space-sm)' }}>
                            <stat.icon size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-secondary)' }} />
                            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {stat.label}
                            </span>
                        </div>
                        <div className="flex items-end gap-sm" style={{ marginTop: '20px' }}>
                            <span style={{ fontSize: '24px', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--color-text-primary)' }}>{stat.value}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-4 gap-md" style={{ marginBottom: 'var(--space-xl)' }}>
                {[
                    { href: '/dashboard/sources', icon: Globe, label: 'Traffic Sources', desc: 'View source breakdown' },
                    { href: '/dashboard/funnels', icon: Target, label: 'Funnels', desc: 'Track conversions' },
                    { href: '/dashboard/heatmaps', icon: MousePointer2, label: 'Heatmaps', desc: 'See click patterns' },
                    { href: '/dashboard/settings', icon: CreditCard, label: 'Upgrade Plan', desc: 'Get more features' }
                ].map((action, i) => (
                    <Link key={i} href={action.href} style={{ 
                        background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '16px',
                        textDecoration: 'none', transition: 'background var(--transition-fast)' 
                    }}>
                        <div className="flex items-center gap-md">
                            <action.icon size={16} strokeWidth={1.5} style={{ color: 'var(--color-text-secondary)' }} />
                            <div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '2px', color: 'var(--color-text-primary)' }}>{action.label}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{action.desc}</div>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-3 gap-lg" style={{ marginBottom: 'var(--space-xl)' }}>
                {/* Traffic Chart */}
                <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
                        <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>Traffic Overview</h4>
                    </div>
                    <div style={{ height: '280px', border: '1px solid var(--color-border)', borderRadius: '6px', paddingTop: 'var(--space-md)' }}>
                        {timeseries.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={timeseries}>
                                    <XAxis
                                        dataKey="date"
                                        stroke="var(--color-text-muted)"
                                        fontSize={12}
                                        tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    />
                                    <YAxis stroke="var(--color-text-muted)" fontSize={12} />
                                    <Tooltip
                                        contentStyle={{
                                            background: 'var(--color-bg-card)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)'
                                        }}
                                    />
                                    <Line type="monotone" dataKey="pageviews" stroke="var(--color-text-primary)" strokeWidth={2} dot={false} name="Pageviews" />
                                    <Line type="monotone" dataKey="visitors" stroke="var(--color-text-muted)" strokeDasharray="4 4" strokeWidth={2} dot={false} name="Visitors" />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <BarChart3 size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                                    <p>No traffic data yet</p>
                                    <p style={{ fontSize: '0.875rem' }}>Data will appear once your tracking script is installed</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sources Pie Chart */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ paddingBottom: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
                        <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>Traffic Sources</h4>
                    </div>
                    {pieData.length > 0 ? (
                        <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', padding: 'var(--space-md)', height: '280px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ flex: 1, minHeight: 0 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={50}
                                            outerRadius={80}
                                            dataKey="value"
                                            paddingAngle={2}
                                            stroke="transparent"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={index} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            contentStyle={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)' }}
                                            itemStyle={{ color: 'var(--color-text-primary)' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginTop: 'var(--space-md)', justifyContent: 'center' }}>
                                {pieData.map((item, i) => (
                                    <div key={i} className="flex items-center gap-xs" style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color }} />
                                        {item.name}: {item.value}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                            <div style={{ textAlign: 'center' }}>
                                <Globe size={32} style={{ marginBottom: 'var(--space-sm)', opacity: 0.5 }} />
                                <p style={{ fontSize: '0.875rem' }}>No source data yet</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-2 gap-lg" style={{ marginBottom: 'var(--space-xl)' }}>
                {/* Top Pages */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ paddingBottom: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
                        <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>Top Pages</h4>
                    </div>
                    {topPages.length > 0 ? (
                        <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {topPages.slice(0, 8).map((page, i) => (
                                        <tr key={i} style={{ borderBottom: i === Math.min(topPages.length, 8) - 1 ? 'none' : '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                                                    {page.path}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', width: '80px' }}>
                                                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                                    {page.views.toLocaleString()}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', padding: 'var(--space-xl)', textAlign: 'center' }}>
                            <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
                                No page views yet
                            </p>
                        </div>
                    )}
                </div>

                {/* Real-time Activity */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="flex items-center justify-between" style={{ paddingBottom: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
                        <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>Real-Time Activity</h4>
                        <RefreshCw size={14} style={{ color: 'var(--color-text-muted)' }} />
                    </div>
                    <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', padding: 'var(--space-lg)' }}>
                        <div style={{
                            marginBottom: 'var(--space-xl)',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '3rem', fontWeight: 500, letterSpacing: '-0.04em', color: realtime?.activeVisitors ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                {realtime?.activeVisitors || 0}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>
                                Active visitors right now
                            </div>
                        </div>
                        <div>
                            <div style={{
                                fontSize: '0.6875rem',
                                color: 'var(--color-text-muted)',
                                marginBottom: 'var(--space-sm)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }}>
                                Active Pages
                            </div>
                            {realtime?.activePages && realtime.activePages.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {realtime.activePages.slice(0, 5).map((page, i) => (
                                        <div key={i} className="flex items-center justify-between" style={{ padding: '6px 0', borderBottom: i === Math.min(realtime.activePages.length, 5) - 1 ? 'none' : '1px dotted var(--color-border)' }}>
                                            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{page.path}</span>
                                            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{page.count}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 }}>
                                    No active pages
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
