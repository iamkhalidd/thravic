'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Users, Globe, Activity, DollarSign, TrendingUp, AlertCircle, AlertTriangle, CheckCircle, Info, ChevronRight } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
    ResponsiveContainer, CartesianGrid
} from 'recharts';
import Link from 'next/link';

interface DashboardStats {
    stats: {
        totalUsers: number;
        totalDomains: number;
        eventsToday: number;
        paidSubscriptions: number;
        mrr: number;
    };
    planDistribution: { plan: string; count: string }[];
    topDomains: { domain: string; owner: string; events_count: string }[];
    recentSignups: { id: string; name: string; email: string; subscription: string; created_at: string }[];
}

interface ActionItem {
    type: string;
    severity: 'info' | 'warning' | 'critical' | 'success';
    title: string;
    detail: string;
    count: number;
    link: string;
}

interface ChartData {
    signups: { date: string; count: string }[];
    events: { date: string; count: string }[];
    sessions: { date: string; count: string }[];
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [charts, setCharts] = useState<ChartData | null>(null);
    const [actions, setActions] = useState<ActionItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const [statsData, chartsData, actionsData] = await Promise.all([
                    api.get<DashboardStats>('/api/admin/dashboard/stats'),
                    api.get<ChartData>('/api/admin/dashboard/charts?days=30'),
                    api.get<{ actions: ActionItem[] }>('/api/admin/dashboard/actions'),
                ]);
                setStats(statsData);
                setCharts(chartsData);
                setActions(actionsData?.actions ?? []);
            } catch (err) {
                console.error('Dashboard load error:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) {
        return <div className="loading"><div className="spinner" /></div>;
    }

    const SEVERITY_ICON: Record<string, typeof AlertCircle> = {
        critical: AlertCircle,
        warning: AlertTriangle,
        success: CheckCircle,
        info: Info,
    };
    const SEVERITY_COLOR: Record<string, string> = {
        critical: 'var(--color-danger)',
        warning: 'var(--color-warning)',
        success: 'var(--color-success)',
        info: 'var(--color-text-primary)',
    };

    const kpis = stats ? [
        { label: 'Total Users', value: stats.stats.totalUsers.toLocaleString(), icon: Users, color: 'var(--color-text-primary)', bg: 'rgba(255,255,255,0.05)' },
        { label: 'Active Domains', value: stats.stats.totalDomains.toLocaleString(), icon: Globe, color: 'var(--color-text-secondary)', bg: 'rgba(255,255,255,0.05)' },
        { label: 'Events Today', value: stats.stats.eventsToday.toLocaleString(), icon: Activity, color: 'var(--color-text-primary)', bg: 'rgba(255,255,255,0.05)' },
        { label: 'MRR', value: `$${stats.stats.mrr.toLocaleString()}`, icon: DollarSign, color: 'var(--color-text-secondary)', bg: 'rgba(255,255,255,0.05)' },
        { label: 'Paid Subscriptions', value: stats.stats.paidSubscriptions.toLocaleString(), icon: TrendingUp, color: 'var(--color-text-primary)', bg: 'rgba(255,255,255,0.05)' },
    ] : [];

    return (
        <div>
            {/* ── Action Feed ───────────────────────────── */}
            {actions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginBottom: 'var(--space-xl)' }}>
                    {actions.map((action) => {
                        const Icon = SEVERITY_ICON[action.severity] ?? Info;
                        const color = SEVERITY_COLOR[action.severity] ?? 'var(--color-text-primary)';
                        return (
                            <div key={action.type} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-md)',
                                padding: 'var(--space-md) var(--space-lg)',
                                background: `${color}14`,
                                border: `1px solid ${color}40`,
                                borderLeft: `4px solid ${color}`,
                                borderRadius: 'var(--radius-md)',
                            }}>
                                <Icon size={18} color={color} style={{ flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>{action.title}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{action.detail}</div>
                                </div>
                                <Link
                                    href={action.link}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        fontSize: '13px', color, textDecoration: 'none', fontWeight: 500,
                                        whiteSpace: 'nowrap', flexShrink: 0,
                                    }}
                                >
                                    View <ChevronRight size={14} />
                                </Link>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* KPI Cards */}
            <div className="stats-grid">
                {kpis.map((kpi) => (
                    <div key={kpi.label} className="stat-card">
                        <div className="stat-icon" style={{ background: kpi.bg }}>
                            <kpi.icon size={22} color={kpi.color} />
                        </div>
                        <div>
                            <div className="stat-value">{kpi.value}</div>
                            <div className="stat-label">{kpi.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts row */}
            <div className="admin-grid-2">
                {/* Events chart */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Events (30 days)</span>
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={charts?.events.map(e => ({ date: e.date?.slice(5, 10), count: parseInt(e.count) })) || []}>
                            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                            <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                            <Tooltip
                                contentStyle={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)' }}
                            />
                            <Bar dataKey="count" fill="var(--color-text-primary)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Signups chart */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Signups (30 days)</span>
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={charts?.signups.map(s => ({ date: s.date?.slice(5, 10), count: parseInt(s.count) })) || []}>
                            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                            <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                            <Tooltip
                                contentStyle={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)' }}
                            />
                            <Line type="monotone" dataKey="count" stroke="var(--color-text-secondary)" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Tables row */}
            <div className="admin-grid-2">
                {/* Top domains */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Top Domains (30d)</span>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Domain</th>
                                <th>Owner</th>
                                <th>Events</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats?.topDomains.map((d, i) => (
                                <tr key={i}>
                                    <td style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{d.domain}</td>
                                    <td>{d.owner}</td>
                                    <td>{parseInt(d.events_count).toLocaleString()}</td>
                                </tr>
                            ))}
                            {!stats?.topDomains.length && (
                                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>No data</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Recent signups */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Recent Signups</span>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Plan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats?.recentSignups.map((u) => (
                                <tr key={u.id}>
                                    <td style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{u.name}</td>
                                    <td>{u.email}</td>
                                    <td><span className={`badge badge-${u.subscription}`}>{u.subscription}</span></td>
                                </tr>
                            ))}
                            {!stats?.recentSignups.length && (
                                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>No data</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
