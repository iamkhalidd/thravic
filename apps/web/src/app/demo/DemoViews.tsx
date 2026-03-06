'use client';

import {
    BarChart3, Users, MousePointer2, Clock, TrendingUp, TrendingDown,
    Globe, RefreshCw, ArrowRight, ArrowUpRight, ArrowDownRight,
    Target, Video, Sparkles, FileBarChart, Download, Mail, Lightbulb,
    Play, Monitor, Smartphone, Tablet, AlertTriangle, Zap,
    Search, Filter, Eye, ExternalLink, Calendar, CheckCircle
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area
} from 'recharts';
import * as data from './demoData';

const tooltipStyle = {
    background: 'var(--color-bg-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    fontSize: '0.8125rem'
};

const cardStyle: React.CSSProperties = {
    background: 'var(--color-bg-secondary)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-border)',
    padding: 'var(--space-lg)',
};

const badgeStyle: React.CSSProperties = {
    padding: '2px 8px',
    background: 'var(--color-bg-tertiary)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '0.75rem',
};

const thStyle: React.CSSProperties = {
    padding: 'var(--space-sm) var(--space-md)',
    textAlign: 'left' as const,
    fontSize: '0.75rem',
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase' as const,
    borderBottom: '1px solid var(--color-border)',
    fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
    padding: 'var(--space-sm) var(--space-md)',
    fontSize: '0.875rem',
    borderBottom: '1px solid var(--color-border)',
};

function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
}

function ChangeIndicator({ value }: { value: number }) {
    const isPositive = value >= 0;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.8125rem', color: isPositive ? 'var(--color-success, #22c55e)' : 'var(--color-error, #ef4444)' }}>
            {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(value)}%
        </span>
    );
}

// ── Overview ──
export function OverviewView() {
    const statCards = [
        { label: 'Total Pageviews', value: '28,450', icon: BarChart3, color: 'var(--color-accent-primary)' },
        { label: 'Unique Visitors', value: '8,730', icon: Users, color: '#34B1AA' },
        { label: 'Bounce Rate', value: '38.2%', icon: MousePointer2, color: '#f59e0b' },
        { label: 'Avg. Session', value: '3m 24s', icon: Clock, color: '#10b981' },
    ];

    return (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
                {statCards.map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                        <div key={i} style={{ ...cardStyle, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: stat.color }} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
                                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{stat.label}</span>
                                <Icon size={18} style={{ color: stat.color }} />
                            </div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{stat.value}</div>
                        </div>
                    );
                })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
                <div style={cardStyle}>
                    <h4 style={{ margin: '0 0 var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <TrendingUp size={18} style={{ color: 'var(--color-primary)' }} /> Traffic Overview
                    </h4>
                    <div style={{ height: '280px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.trafficData}>
                                <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={12} tickFormatter={v => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tickLine={false} axisLine={false} />
                                <YAxis stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Line type="monotone" dataKey="pageviews" stroke="var(--color-accent-primary)" strokeWidth={2} dot={false} name="Pageviews" />
                                <Line type="monotone" dataKey="visitors" stroke="#34B1AA" strokeWidth={2} dot={false} name="Visitors" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div style={cardStyle}>
                    <h4 style={{ margin: '0 0 var(--space-md)' }}>Traffic Sources</h4>
                    <div style={{ height: '180px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={data.sourceData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                                    {data.sourceData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                        {data.sourceData.map((item, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: item.color }} />
                                {item.name}: {item.value.toLocaleString()}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
                <div style={cardStyle}>
                    <h4 style={{ margin: '0 0 var(--space-md)' }}>Top Pages</h4>
                    <table style={{ width: '100%' }}>
                        <tbody>
                            {data.topPages.map((page, i) => (
                                <tr key={i}>
                                    <td style={{ padding: 'var(--space-sm) 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.875rem' }}>{page.path}</td>
                                    <td style={{ padding: 'var(--space-sm) 0', borderBottom: '1px solid var(--color-border)', textAlign: 'right', width: '80px' }}>
                                        <span style={badgeStyle}>{page.views.toLocaleString()}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
                        <h4 style={{ margin: 0 }}>Real-Time Activity</h4>
                        <RefreshCw size={16} style={{ color: 'var(--color-text-tertiary)', animation: 'spin 3s linear infinite' }} />
                    </div>
                    <div style={{ padding: 'var(--space-lg)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--color-success, #22c55e)' }}>127</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Active visitors right now</div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-sm)', textTransform: 'uppercase' }}>Active Pages</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                        {data.activePages.map((page, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.875rem' }}>{page.path}</span>
                                <span style={badgeStyle}>{page.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}

// ── Traffic Sources ──
export function TrafficSourcesView() {
    return (
        <>
            <h2 style={{ margin: '0 0 var(--space-lg)', fontSize: '1.25rem' }}>Traffic Sources</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
                <div style={cardStyle}>
                    <h4 style={{ margin: '0 0 var(--space-md)' }}>Visitors by Source</h4>
                    <div style={{ height: '280px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.trafficSources} layout="vertical">
                                <XAxis type="number" stroke="var(--color-text-muted)" fontSize={12} />
                                <YAxis type="category" dataKey="source" stroke="var(--color-text-muted)" fontSize={12} width={120} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Bar dataKey="visitors" fill="var(--color-accent-primary)" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div style={cardStyle}>
                    <h4 style={{ margin: '0 0 var(--space-md)' }}>By Type</h4>
                    <div style={{ height: '200px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={data.sourceData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>
                                    {data.sourceData.map((e, i) => (<Cell key={i} fill={e.color} />))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                        {data.sourceData.map((item, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: item.color }} />
                                {item.name}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div style={cardStyle}>
                <h4 style={{ margin: '0 0 var(--space-md)' }}>All Sources</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        {['Source', 'Type', 'Visitors', 'Pageviews', 'Bounce Rate', 'Avg. Duration', 'Change'].map(h => (
                            <th key={h} style={thStyle}>{h}</th>
                        ))}
                    </tr></thead>
                    <tbody>
                        {data.trafficSources.map((s, i) => (
                            <tr key={i}>
                                <td style={{ ...tdStyle, fontWeight: 500 }}><div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ExternalLink size={12} style={{ color: 'var(--color-primary)' }} />{s.source}</div></td>
                                <td style={tdStyle}><span style={{ ...badgeStyle, background: 'var(--color-bg-hover)', color: 'var(--color-primary)' }}>{s.type}</span></td>
                                <td style={tdStyle}>{s.visitors.toLocaleString()}</td>
                                <td style={tdStyle}>{s.pageviews.toLocaleString()}</td>
                                <td style={tdStyle}>{s.bounceRate}%</td>
                                <td style={tdStyle}>{formatDuration(s.avgDuration)}</td>
                                <td style={tdStyle}><ChangeIndicator value={s.change} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// ── Campaigns ──
export function CampaignsView() {
    return (
        <>
            <h2 style={{ margin: '0 0 var(--space-lg)', fontSize: '1.25rem' }}>Campaigns</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
                {[
                    { label: 'Total Visitors', value: '9,200', color: 'var(--color-accent-primary)' },
                    { label: 'Total Conversions', value: '667', color: '#10b981' },
                    { label: 'Avg. Conversion Rate', value: '7.7%', color: '#f59e0b' },
                ].map((s, i) => (
                    <div key={i} style={{ ...cardStyle, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: s.color }} />
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>{s.label}</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{s.value}</div>
                    </div>
                ))}
            </div>
            <div style={cardStyle}>
                <h4 style={{ margin: '0 0 var(--space-md)' }}>All Campaigns</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        {['Campaign', 'Source / Medium', 'Visitors', 'Conversions', 'Conv. Rate', 'Cost', 'Revenue'].map(h => (
                            <th key={h} style={thStyle}>{h}</th>
                        ))}
                    </tr></thead>
                    <tbody>
                        {data.campaigns.map((c, i) => (
                            <tr key={i}>
                                <td style={{ ...tdStyle, fontWeight: 500 }}>{c.name}</td>
                                <td style={tdStyle}><span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{c.source} / {c.medium}</span></td>
                                <td style={tdStyle}>{c.visitors.toLocaleString()}</td>
                                <td style={tdStyle}>{c.conversions}</td>
                                <td style={tdStyle}><span style={{ color: c.convRate > 6 ? 'var(--color-success, #22c55e)' : 'var(--color-text-primary)' }}>{c.convRate}%</span></td>
                                <td style={tdStyle}>${c.cost.toLocaleString()}</td>
                                <td style={{ ...tdStyle, color: 'var(--color-success, #22c55e)', fontWeight: 500 }}>${c.revenue.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// ── Trends ──
export function TrendsView() {
    return (
        <>
            <h2 style={{ margin: '0 0 var(--space-lg)', fontSize: '1.25rem' }}>Traffic Trends</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
                {data.trendMetrics.map((t, i) => (
                    <div key={i} style={cardStyle}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>{t.metric}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                            <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                {t.metric === 'Avg. Session Duration' ? formatDuration(t.current) : t.metric === 'Bounce Rate' || t.metric === 'New vs Returning' ? `${t.current}%` : t.current.toLocaleString()}
                            </span>
                            <ChangeIndicator value={t.change} />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                            vs. {t.metric === 'Avg. Session Duration' ? formatDuration(t.previous) : t.metric === 'Bounce Rate' || t.metric === 'New vs Returning' ? `${t.previous}%` : t.previous.toLocaleString()} prev. period
                        </div>
                    </div>
                ))}
            </div>
            <div style={cardStyle}>
                <h4 style={{ margin: '0 0 var(--space-md)' }}>Traffic Over Time</h4>
                <div style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.trafficData}>
                            <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={12} tickFormatter={v => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tickLine={false} axisLine={false} />
                            <YAxis stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Area type="monotone" dataKey="pageviews" stroke="var(--color-accent-primary)" fill="var(--color-bg-hover)" strokeWidth={2} name="Pageviews" />
                            <Area type="monotone" dataKey="visitors" stroke="#34B1AA" fill="rgba(52,177,170,0.1)" strokeWidth={2} name="Visitors" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </>
    );
}

// ── Behavior Pages ──
export function BehaviorPagesView() {
    return (
        <>
            <h2 style={{ margin: '0 0 var(--space-lg)', fontSize: '1.25rem' }}>Pages</h2>
            <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
                    <h4 style={{ margin: 0 }}>All Pages</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-xs) var(--space-md)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                        <Search size={14} /> Search pages...
                    </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        {['Page Path', 'Views', 'Unique Views', 'Avg. Time', 'Entrances', 'Exits', 'Bounce Rate'].map(h => (
                            <th key={h} style={thStyle}>{h}</th>
                        ))}
                    </tr></thead>
                    <tbody>
                        {data.behaviorPages.map((p, i) => (
                            <tr key={i}>
                                <td style={{ ...tdStyle, fontWeight: 500 }}>{p.path}</td>
                                <td style={tdStyle}>{p.views.toLocaleString()}</td>
                                <td style={tdStyle}>{p.uniqueViews.toLocaleString()}</td>
                                <td style={tdStyle}>{formatDuration(p.avgTime)}</td>
                                <td style={tdStyle}>{p.entrances.toLocaleString()}</td>
                                <td style={tdStyle}>{p.exits.toLocaleString()}</td>
                                <td style={tdStyle}><span style={{ color: p.bounceRate > 40 ? 'var(--color-error, #ef4444)' : p.bounceRate > 30 ? 'var(--color-warning, #f59e0b)' : 'var(--color-success, #22c55e)' }}>{p.bounceRate}%</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// ── Funnels ──
export function FunnelsView() {
    const maxVisitors = data.funnelSteps[0].visitors;
    return (
        <>
            <h2 style={{ margin: '0 0 var(--space-lg)', fontSize: '1.25rem' }}>Funnels</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
                {[
                    { label: 'Total Entries', value: '5,200', color: 'var(--color-accent-primary)' },
                    { label: 'Completed', value: '524', color: '#10b981' },
                    { label: 'Overall Conversion', value: '10.1%', color: '#f59e0b' },
                ].map((s, i) => (
                    <div key={i} style={{ ...cardStyle, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: s.color }} />
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>{s.label}</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{s.value}</div>
                    </div>
                ))}
            </div>
            <div style={cardStyle}>
                <h4 style={{ margin: '0 0 var(--space-lg)' }}>Signup → Conversion Funnel</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    {data.funnelSteps.map((step, i) => {
                        const width = (step.visitors / maxVisitors) * 100;
                        const dropoff = i > 0 ? data.funnelSteps[i - 1].visitors - step.visitors : 0;
                        const dropoffPct = i > 0 ? ((dropoff / data.funnelSteps[i - 1].visitors) * 100).toFixed(1) : 0;
                        return (
                            <div key={i}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{step.name}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{step.visitors.toLocaleString()}</span>
                                        {i > 0 && <span style={{ fontSize: '0.75rem', color: 'var(--color-error, #ef4444)' }}>-{dropoffPct}% drop-off</span>}
                                    </div>
                                </div>
                                <div style={{ height: '32px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${width}%`, background: `linear-gradient(90deg, var(--color-accent-primary), #E0B50F)`, borderRadius: 'var(--radius-md)', transition: 'width 0.8s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 'var(--space-sm)' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'white' }}>{step.rate}%</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}

// ── Heatmaps ──
export function HeatmapsView() {
    return (
        <>
            <h2 style={{ margin: '0 0 var(--space-lg)', fontSize: '1.25rem' }}>Heatmaps</h2>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
                {/* Left Tabs (Segmented Control) */}
                <div style={{ 
                    display: 'inline-flex', 
                    gap: '4px', 
                    background: 'var(--color-bg-secondary)',
                    padding: '4px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)'
                }}>
                    {['Click Map', 'Scroll Map'].map((tab, i) => (
                        <button key={tab} style={{ 
                            padding: '6px 16px', 
                            background: i === 0 ? 'var(--color-bg-hover)' : 'transparent', 
                            color: i === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', 
                            border: i === 0 ? '1px solid var(--color-border)' : '1px solid transparent', 
                            borderRadius: '6px', 
                            cursor: 'pointer', 
                            fontSize: '0.8125rem', 
                            fontWeight: i === 0 ? 500 : 400 
                        }}>{tab}</button>
                    ))}
                </div>
                
                {/* Right Tabs */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-sm)' }}>
                    {[{ icon: Monitor, label: 'Desktop' }, { icon: Tablet, label: 'Tablet' }, { icon: Smartphone, label: 'Mobile' }].map((d, i) => (
                        <button key={d.label} style={{ 
                            padding: 'var(--space-xs) var(--space-sm)', 
                            background: i === 0 ? 'var(--color-text-primary)' : 'var(--color-bg-tertiary)', 
                            border: '1px solid ' + (i === 0 ? 'var(--color-border)' : 'var(--color-border)'), 
                            borderRadius: 'var(--radius-md)', 
                            color: i === 0 ? 'var(--color-bg-primary)' : 'var(--color-text-secondary)', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            fontSize: '0.8125rem' 
                        }}>
                            <d.icon size={14} /> {d.label}
                        </button>
                    ))}
                </div>
            </div>
            <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                    <Globe size={16} style={{ color: 'var(--color-primary)' }} />
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>demo-site.com/</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>1,247 interactions • 892 visitors</span>
                </div>
                <div style={{ position: 'relative', height: '500px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                    {/* Page wireframe */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', padding: '0 var(--space-lg)' }}>
                        <div style={{ width: '80px', height: '20px', background: 'var(--color-bg-tertiary)', borderRadius: '4px' }} />
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-md)' }}>
                            {[60, 50, 50, 70].map((w, i) => <div key={i} style={{ width: `${w}px`, height: '14px', background: 'var(--color-bg-tertiary)', borderRadius: '4px' }} />)}
                        </div>
                    </div>
                    <div style={{ position: 'absolute', top: '60px', left: '15%', right: '15%', textAlign: 'center' }}>
                        <div style={{ width: '60%', height: '24px', background: 'var(--color-bg-secondary)', borderRadius: '4px', margin: '0 auto 12px' }} />
                        <div style={{ width: '80%', height: '14px', background: 'var(--color-bg-secondary)', borderRadius: '4px', margin: '0 auto 8px' }} />
                        <div style={{ width: '120px', height: '36px', background: 'var(--color-bg-secondary)', borderRadius: '6px', margin: '12px auto' }} />
                    </div>
                    {/* Heatmap dots */}
                    {data.heatmapPoints.map((pt, i) => {
                        const size = 30 + pt.intensity * 60;
                        const r = Math.round(255 * pt.intensity);
                        const g = Math.round(80 * (1 - pt.intensity));
                        const b = Math.round(50 * (1 - pt.intensity));
                        return (
                            <div key={i} title={`${pt.label}: ${Math.round(pt.intensity * 100)}% activity`} style={{
                                position: 'absolute', left: `${pt.x}%`, top: `${pt.y}%`, transform: 'translate(-50%, -50%)',
                                width: `${size}px`, height: `${size}px`, borderRadius: '50%',
                                background: `radial-gradient(circle, rgba(${r},${g},${b},0.7) 0%, rgba(${r},${g},${b},0.15) 60%, transparent 100%)`,
                                pointerEvents: 'auto', cursor: 'pointer',
                            }} />
                        );
                    })}
                    {/* Legend */}
                    <div style={{ position: 'absolute', bottom: 'var(--space-md)', right: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-xs) var(--space-sm)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '0.75rem' }}>
                        <span>Cold</span>
                        <div style={{ width: '80px', height: '8px', borderRadius: '4px', background: 'linear-gradient(90deg, rgba(50,50,255,0.4), rgba(255,255,0,0.6), rgba(255,80,0,0.8), rgba(255,0,0,0.9))' }} />
                        <span>Hot</span>
                    </div>
                </div>
            </div>
        </>
    );
}

// ── Sessions ──
export function SessionsView() {
    return (
        <>
            <h2 style={{ margin: '0 0 var(--space-lg)', fontSize: '1.25rem' }}>Session Recordings</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
                {[
                    { label: 'Total Sessions', value: '1,247' },
                    { label: 'Avg. Duration', value: '3m 12s' },
                    { label: 'Avg. Pages', value: '4.8' },
                    { label: 'Active Now', value: '23' },
                ].map((s, i) => (
                    <div key={i} style={cardStyle}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>{s.label}</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{s.value}</div>
                    </div>
                ))}
            </div>
            <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
                    <h4 style={{ margin: 0 }}>Recent Sessions</h4>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button style={{ padding: 'var(--space-xs) var(--space-sm)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8125rem' }}><Filter size={14} /> Filter</button>
                        <button style={{ padding: 'var(--space-xs) var(--space-sm)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8125rem' }}><Search size={14} /> Search</button>
                    </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        {['', 'Visitor', 'Duration', 'Pages', 'Device', 'Browser', 'Country', 'Start Page', 'Time'].map(h => (
                            <th key={h} style={thStyle}>{h}</th>
                        ))}
                    </tr></thead>
                    <tbody>
                        {data.sessions.map((s, i) => {
                            const DeviceIcon = s.device === 'Desktop' ? Monitor : s.device === 'Mobile' ? Smartphone : Tablet;
                            return (
                                <tr key={i} style={{ cursor: 'pointer' }}>
                                    <td style={tdStyle}><Play size={14} style={{ color: 'var(--color-primary)' }} /></td>
                                    <td style={{ ...tdStyle, fontWeight: 500, fontFamily: 'monospace', fontSize: '0.8125rem' }}>{s.visitorId}</td>
                                    <td style={tdStyle}>{formatDuration(s.duration)}</td>
                                    <td style={tdStyle}>{s.pages}</td>
                                    <td style={tdStyle}><div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><DeviceIcon size={14} />{s.device}</div></td>
                                    <td style={tdStyle}>{s.browser}</td>
                                    <td style={tdStyle}>{s.country}</td>
                                    <td style={tdStyle}>{s.startPage}</td>
                                    <td style={{ ...tdStyle, fontSize: '0.8125rem', color: 'var(--color-text-tertiary)' }}>{new Date(s.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// ── AI Insights ──
export function InsightsView() {
    const icons: Record<string, React.ElementType> = { trend: TrendingUp, anomaly: AlertTriangle, performance: Zap, opportunity: Target, warning: AlertTriangle };
    const prioColors: Record<string, string> = { high: 'var(--color-error, #ef4444)', medium: 'var(--color-warning, #f59e0b)', low: 'var(--color-success, #22c55e)' };
    return (
        <>
            <h2 style={{ margin: '0 0 var(--space-lg)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Sparkles size={20} style={{ color: 'var(--color-primary)' }} /> AI Insights
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                {data.insights.map((insight, i) => {
                    const Icon = icons[insight.type] || Sparkles;
                    return (
                        <div key={i} style={{ ...cardStyle, borderLeft: `3px solid ${prioColors[insight.priority]}` }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
                                <div style={{ padding: 'var(--space-sm)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', marginTop: '2px' }}>
                                    <Icon size={18} style={{ color: prioColors[insight.priority] }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: '4px' }}>
                                        <span style={{ fontWeight: 600 }}>{insight.title}</span>
                                        <span style={{ ...badgeStyle, background: `${prioColors[insight.priority]}22`, color: prioColors[insight.priority], textTransform: 'capitalize' }}>{insight.priority}</span>
                                    </div>
                                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-sm)' }}>{insight.description}</p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
                                        <span style={{ ...badgeStyle, fontWeight: 600 }}>{insight.metric}: {insight.value}</span>
                                    </div>
                                    {insight.recommendation && (
                                        <div style={{ padding: 'var(--space-sm) var(--space-md)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem' }}>
                                            <strong><Lightbulb size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Recommendation:</strong> {insight.recommendation}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}

// ── Reports ──
export function ReportsView() {
    return (
        <>
            <h2 style={{ margin: '0 0 var(--space-lg)', fontSize: '1.25rem' }}>Reports</h2>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
                <button style={{ padding: 'var(--space-sm) var(--space-md)', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem', fontWeight: 600 }}>
                    <FileBarChart size={16} /> Create Report
                </button>
                <button style={{ padding: 'var(--space-sm) var(--space-md)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem' }}>
                    <Download size={16} /> Export All
                </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                {data.reportTemplates.map((report, i) => (
                    <div key={i} style={{ ...cardStyle, cursor: 'pointer', transition: 'border-color 0.2s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                                <div style={{ padding: 'var(--space-sm)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                    <FileBarChart size={20} style={{ color: 'var(--color-primary)' }} />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>{report.name}</div>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{report.description}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>{report.schedule}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>Last: {report.lastRun}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                                    <button style={{ padding: 'var(--space-xs)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }} title="Download"><Download size={14} /></button>
                                    <button style={{ padding: 'var(--space-xs)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }} title="Email"><Mail size={14} /></button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}
