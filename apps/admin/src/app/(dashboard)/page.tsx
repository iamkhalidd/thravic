'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
    ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { api } from '@/lib/api';
import { MaskedEmail } from '@/components/MaskedEmail';

interface DashboardStats {
    stats: {
        totalUsers: number;
        totalDomains: number;
        eventsToday: number;
        paidSubscriptions: number;
        mrr: number;
        payingAccounts: number;
        graceAccounts: number;
        graceMrr: number;
        complimentaryAccounts: number;
    };
    timezone: string;
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

const tooltipStyle = {
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    color: 'var(--color-text-primary)',
    fontSize: 12,
};
const axisTick = { fill: 'var(--chart-axis)', fontSize: 11 };

function shortDate(value: string) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function series(rows: { date: string; count: string }[] | undefined) {
    return (rows ?? []).map(r => ({ date: shortDate(r.date), count: Number(r.count) || 0 }));
}

function timeAgo(value: string) {
    const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

export default function AdminOverview() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [charts, setCharts] = useState<ChartData | null>(null);
    const [actions, setActions] = useState<ActionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

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
                setFailed(true);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) {
        return (
            <div className="page-stack">
                <div className="stat-grid">
                    {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton" style={{ height: 86 }} />)}
                </div>
                <div className="split-grid">
                    <div className="skeleton" style={{ height: 300 }} />
                    <div className="skeleton" style={{ height: 300 }} />
                </div>
            </div>
        );
    }

    if (failed || !stats) {
        return <div className="card empty-note">The overview could not be loaded. Refresh the page to try again.</div>;
    }

    const s = stats.stats;
    const paidShare = s.totalUsers ? Math.round((s.paidSubscriptions / s.totalUsers) * 100) : 0;
    const events = series(charts?.events);
    const signups = series(charts?.signups);
    const signupsTotal = signups.reduce((sum, d) => sum + d.count, 0);
    const eventsTotal = events.reduce((sum, d) => sum + d.count, 0);
    const plans = stats.planDistribution
        .map(p => ({ plan: p.plan, count: Number(p.count) || 0 }))
        .sort((a, b) => b.count - a.count);
    const planTotal = plans.reduce((sum, p) => sum + p.count, 0);

    const tiles = [
        { label: 'Users', value: s.totalUsers.toLocaleString(), hint: `${signupsTotal.toLocaleString()} joined in 30 days` },
        { label: 'Paid subscriptions', value: s.paidSubscriptions.toLocaleString(), hint: `${paidShare}% of users` },
        {
            label: 'Monthly revenue',
            value: `₦${Math.round(s.mrr).toLocaleString()}`,
            hint: `${s.payingAccounts} paying · ${s.graceAccounts} at risk · ${s.complimentaryAccounts} free grants`,
            title: 'What paying accounts actually paid, after promos, with yearly plans counted as 1/12 a month. '
                + `At risk: ${s.graceAccounts} in their grace days (₦${Math.round(s.graceMrr).toLocaleString()} a month), not counted. `
                + 'Free grants: paid plans given by an admin or a 100% promo, not counted.',
        },
        { label: 'Active domains', value: s.totalDomains.toLocaleString(), hint: 'Sites and apps' },
        { label: 'Events today', value: s.eventsToday.toLocaleString(), hint: `Since midnight, ${stats.timezone.split('/').pop()?.replace('_', ' ')} time` },
    ] as { label: string; value: string; hint: string; title?: string }[];

    return (
        <div className="page-stack">
            {actions.length > 0 && (
                <section className="card card-flush" aria-label="Needs attention">
                    <div className="card-header" style={{ paddingBottom: 12, marginBottom: 0 }}>
                        <span className="card-title">Needs attention</span>
                        <span className="badge">{actions.length}</span>
                    </div>
                    <div className="alert-list">
                        {actions.map(action => (
                            <Link key={action.type} href={action.link} className="alert-row">
                                <span className={`alert-dot ${action.severity}`} aria-hidden />
                                <div className="alert-text">
                                    <div className="alert-title">{action.title}</div>
                                    <div className="alert-detail">{action.detail}</div>
                                </div>
                                <ChevronRight size={16} color="var(--color-text-muted)" />
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            <div className="stat-grid">
                {tiles.map(t => (
                    <div key={t.label} className="stat-card" title={t.title}>
                        <span className="stat-label">{t.label}</span>
                        <span className="stat-value">{t.value}</span>
                        <span className="stat-hint">{t.hint}</span>
                    </div>
                ))}
            </div>

            <div className="split-grid">
                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Events</div>
                            <div className="card-subtitle">{eventsTotal.toLocaleString()} in the last 30 days, all domains</div>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={events} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                            <defs>
                                <linearGradient id="eventsFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                            <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
                            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--color-border-hover)' }} />
                            <Area type="monotone" dataKey="count" name="Events" stroke="var(--chart-1)" strokeWidth={2} fill="url(#eventsFill)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Plans</div>
                            <div className="card-subtitle">{planTotal.toLocaleString()} accounts</div>
                        </div>
                        <Link href="/subscriptions" className="card-link">Subscriptions</Link>
                    </div>
                    {plans.length === 0 ? (
                        <div className="empty-note">No accounts yet</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {plans.map(p => {
                                const share = planTotal ? (p.count / planTotal) * 100 : 0;
                                return (
                                    <div key={p.plan}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: 4 }}>
                                            <span style={{ textTransform: 'capitalize' }}>{p.plan}</span>
                                            <span style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                                {p.count.toLocaleString()} · {Math.round(share)}%
                                            </span>
                                        </div>
                                        <div style={{ height: 6, borderRadius: 3, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
                                            <div style={{ width: `${share}%`, height: '100%', background: p.plan === 'free' ? 'var(--color-text-muted)' : 'var(--brand)' }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="split-grid">
                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Sign-ups</div>
                            <div className="card-subtitle">{signupsTotal.toLocaleString()} in the last 30 days</div>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={signups} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                            <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
                            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-bg-hover)' }} />
                            <Bar dataKey="count" name="Sign-ups" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="card card-flush">
                    <div className="card-header">
                        <span className="card-title">Newest users</span>
                        <Link href="/users" className="card-link">All users</Link>
                    </div>
                    {stats.recentSignups.length === 0 ? (
                        <div className="empty-note">No sign-ups yet</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
                            {stats.recentSignups.map(u => (
                                <div key={u.id} className="alert-row" style={{ cursor: 'default' }}>
                                    <div className="alert-text">
                                        <div className="alert-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                                        <div className="alert-detail" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><MaskedEmail email={u.email} /></div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <span className="badge">{u.subscription}</span>
                                        <div className="alert-detail" style={{ marginTop: 2 }}>{timeAgo(u.created_at)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="card card-flush">
                <div className="card-header">
                    <div>
                        <div className="card-title">Busiest domains</div>
                        <div className="card-subtitle">By events in the last 30 days</div>
                    </div>
                    <Link href="/domains" className="card-link">All domains</Link>
                </div>
                {stats.topDomains.length === 0 ? (
                    <div className="empty-note">No events yet</div>
                ) : (
                    <div className="table-scroll" style={{ marginTop: 8 }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: 20 }}>Domain</th>
                                    <th>Owner</th>
                                    <th className="num" style={{ paddingRight: 20 }}>Events</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.topDomains.map(d => (
                                    <tr key={d.domain}>
                                        <td style={{ paddingLeft: 20, fontWeight: 500 }}>{d.domain}</td>
                                        <td className="muted">{d.owner ? <MaskedEmail email={d.owner} /> : '—'}</td>
                                        <td className="num" style={{ paddingRight: 20 }}>{(Number(d.events_count) || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
