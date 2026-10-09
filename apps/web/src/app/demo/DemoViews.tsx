'use client';

// The demo pages, built from the same components and classes as the real
// dashboard pages (app/dashboard/*), fed with sample data instead of the API.

import { useState } from 'react';
import {
    Users, Eye, Activity, MousePointer2, Clock, Trophy, Globe, Search,
    TrendingUp, TrendingDown, CheckCircle, Target, Percent, Monitor, Smartphone,
    Tablet, ArrowDown, Play, Pause, ChevronRight, Sparkles, FileText, Zap, Filter,
    AlertTriangle, Hash, Send, Timer, Download, MousePointerClick, Gauge, LayoutDashboard,
    Paintbrush, Server, Layers,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { BarList } from '@/components/charts/BarList';
import { duration } from '@/components/charts/format';
import * as data from './demoData';

const DEVICE_ICONS = { desktop: Monitor, mobile: Smartphone, tablet: Tablet } as const;

function OnlineBadge() {
    return (
        <span title="Visitors in the last 5 minutes" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 6,
            padding: '2px 10px', borderRadius: 999, border: '1px solid var(--color-border)',
            fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)',
        }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
            {data.realtime.activeVisitors} online
        </span>
    );
}

function SearchField({ label }: { label: string }) {
    return (
        <label style={{ position: 'relative', flex: '0 1 240px', minWidth: 140 }}>
            <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
                type="search"
                className="input"
                aria-label={label}
                placeholder={`${label}…`}
                style={{ padding: '6px 10px 6px 30px', fontSize: '0.8125rem' }}
            />
        </label>
    );
}

function Segmented<T extends string>({ label, options, value, onChange }: {
    label: string;
    options: ReadonlyArray<{ value: T; label: string; icon?: React.ElementType }>;
    value: T;
    onChange: (value: T) => void;
}) {
    return (
        <div className="segmented" role="tablist" aria-label={label}>
            {options.map(o => (
                <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {o.icon && <o.icon size={14} aria-hidden="true" />}
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function minutesAgo(minutes: number): string {
    const m = Math.abs(minutes);
    return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}

// ── Overview ──
export function OverviewView() {
    const m = data.metrics;
    const c = data.metricChange;
    return (
        <div className="page-stack">
            <PageHeader title="Overview" subtitle="demo-site.com" badge={<OnlineBadge />} />

            <div className="stat-grid">
                <StatCard label="Visitors" icon={Users} value={m.uniqueVisitors.toLocaleString()} change={c.uniqueVisitors} />
                <StatCard label="Pageviews" icon={Eye} value={m.pageviews.toLocaleString()} change={c.pageviews} />
                <StatCard label="Sessions" icon={Activity} value={m.sessions.toLocaleString()} change={c.sessions} />
                <StatCard label="Bounce rate" icon={MousePointer2} value={`${m.bounceRate.toFixed(1)}%`} change={c.bounceRate} lowerIsBetter />
                <StatCard label="Avg. session" icon={Clock} value={duration(m.avgSessionDuration)} change={c.avgSessionDuration} />
            </div>

            <div className="split-grid">
                <ChartCard title="Traffic" subtitle="Visitors and pageviews per day">
                    <TimeSeriesChart
                        data={data.trafficData}
                        xKey="date"
                        height={260}
                        series={[
                            { key: 'visitors', label: 'Visitors' },
                            { key: 'pageviews', label: 'Pageviews' },
                        ]}
                    />
                </ChartCard>
                <ChartCard title="Sources" subtitle="Sessions by channel">
                    <BarList items={data.channels} />
                </ChartCard>
            </div>

            <div className="split-grid">
                <ChartCard title="Top pages" subtitle="Pageviews">
                    <BarList items={data.topPages.map(p => ({ label: p.path, value: p.views }))} />
                </ChartCard>
                <ChartCard title="Right now" subtitle="Visitors in the last 5 minutes">
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                        <span className="stat-value" style={{ fontSize: '2rem' }}>{data.realtime.activeVisitors}</span>
                        <span className="stat-hint">{data.realtime.pageviewsLast30Min} pageviews in the last 30 minutes</span>
                    </div>
                    <BarList
                        items={data.realtime.activePages.map(p => ({ label: p.path, value: p.count }))}
                        limit={5}
                        showShare={false}
                    />
                </ChartCard>
            </div>
        </div>
    );
}

// ── Traffic: sources ──
export function TrafficSourcesView() {
    const total = data.channels.reduce((sum, ch) => sum + ch.value, 0);
    const top = data.channels[0];
    return (
        <div className="page-stack">
            <PageHeader title="Sources" subtitle="Where your visitors come from." />
            <div className="stat-grid">
                <StatCard label="Sessions" icon={Activity} value={total.toLocaleString()} hint="All channels" />
                <StatCard label="Top channel" icon={Trophy} value={top.label} hint={`${Math.round((top.value / total) * 100)}% of sessions`} />
                <StatCard label="Direct sessions" icon={MousePointer2} value={top.value.toLocaleString()} hint="Typed in or bookmarked" />
                <StatCard label="Referring sites" icon={Globe} value={data.referrers.length} hint="Search and social are counted in their own channels" />
            </div>
            <div className="dash-grid-2">
                <ChartCard title="Channels" subtitle="Sessions by channel">
                    <BarList items={data.channels} labelHeader="Channel" valueHeader="Sessions" />
                </ChartCard>
                <ChartCard title="Top referrers" subtitle="Other sites that linked visitors here">
                    <BarList items={data.referrers} labelHeader="Site" valueHeader="Sessions" />
                </ChartCard>
                <ChartCard title="Social networks" subtitle="Sessions from social platforms">
                    <BarList items={data.social} labelHeader="Network" valueHeader="Sessions" />
                </ChartCard>
                <ChartCard title="Search engines" subtitle="Organic search sessions by engine">
                    <BarList items={data.search} labelHeader="Engine" valueHeader="Sessions" />
                </ChartCard>
            </div>
        </div>
    );
}

// ── Traffic: campaigns ──
export function CampaignsView() {
    return (
        <div className="page-stack">
            <PageHeader title="Campaigns" subtitle="Performance of links tagged with UTM parameters." />
            <ChartCard title="All campaigns" subtitle={`${data.campaigns.length} campaigns`} flush>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: 20 }}>Campaign</th>
                                <th>Source / medium</th>
                                <th className="num">Sessions</th>
                                <th className="num">Visitors</th>
                                <th className="num">Pageviews</th>
                                <th className="num" style={{ paddingRight: 20 }}>Pages / session</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.campaigns.map(c => (
                                <tr key={c.campaign}>
                                    <td style={{ paddingLeft: 20, fontWeight: 500 }}>{c.campaign}</td>
                                    <td className="muted">{c.source} / {c.medium}</td>
                                    <td className="num">{c.sessions.toLocaleString()}</td>
                                    <td className="num">{c.visitors.toLocaleString()}</td>
                                    <td className="num">{c.pageviews.toLocaleString()}</td>
                                    <td className="num" style={{ paddingRight: 20 }}>{(c.pageviews / c.sessions).toFixed(1)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </ChartCard>
        </div>
    );
}

// ── Traffic: trends ──
const TREND_METRICS = [
    { value: 'visitors', label: 'Visitors' },
    { value: 'pageviews', label: 'Pageviews' },
    { value: 'sessions', label: 'Sessions' },
] as const;

export function TrendsView() {
    const [metric, setMetric] = useState<'visitors' | 'pageviews' | 'sessions'>('visitors');
    const label = TREND_METRICS.find(t => t.value === metric)!.label;
    const rows = data.trafficData;
    const half = Math.floor(rows.length / 2);
    const first = rows.slice(0, half).reduce((s, r) => s + r[metric], 0);
    const second = rows.slice(half).reduce((s, r) => s + r[metric], 0);
    const trend = ((second - first) / first) * 100;
    const best = rows.reduce((max, r) => (r[metric] > max[metric] ? r : max), rows[0]);
    const bestDay = new Date(`${best.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

    return (
        <div className="page-stack">
            <PageHeader
                title="Trends"
                subtitle="How traffic changes across the selected period."
                actions={<Segmented label="Metric" options={TREND_METRICS} value={metric} onChange={setMetric} />}
            />
            <div className="stat-grid">
                <StatCard
                    label={`${label} trend`}
                    value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-success)' }}><TrendingUp size={18} aria-hidden="true" />+{trend.toFixed(1)}%</span>}
                    hint="Second half of the period vs the first"
                />
                <StatCard label="Best day" value={bestDay} hint={`${best[metric].toLocaleString()} ${label.toLowerCase()}`} />
                <StatCard
                    label="Status"
                    value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-success)' }}><CheckCircle size={18} aria-hidden="true" />Growing</span>}
                    hint={`${label} are increasing`}
                />
            </div>
            <ChartCard title={`${label} over time`} subtitle="Per day">
                <TimeSeriesChart data={rows} xKey="date" height={280} series={[{ key: metric, label }]} />
            </ChartCard>
        </div>
    );
}

// ── Behavior: pages ──
export function BehaviorPagesView() {
    const max = Math.max(...data.behaviorPages.map(p => p.pageviews));
    return (
        <div className="page-stack">
            <PageHeader title="Pages" subtitle="Views, time on page, entries and exits for each page." />
            <ChartCard title="All pages" subtitle={`${data.behaviorPages.length} pages`} flush>
                <div className="dash-table-wrap" style={{ marginTop: 12, overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: 20 }}>Page</th>
                                <th className="num">Views ↓</th>
                                <th className="num">Avg. time</th>
                                <th className="num">Entries</th>
                                <th className="num">Exits</th>
                                <th className="num" style={{ paddingRight: 20 }}>Bounce rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.behaviorPages.map(p => (
                                <tr key={p.path}>
                                    <td style={{ paddingLeft: 20, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.path}>{p.path}</td>
                                    <td className="num">
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, verticalAlign: 'middle' }}>
                                            <span aria-hidden="true" style={{ width: 48, height: 6, borderRadius: 3, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
                                                <span style={{ display: 'block', height: '100%', width: `${(p.pageviews / max) * 100}%`, background: 'var(--color-text-muted)', borderRadius: 3 }} />
                                            </span>
                                            <span style={{ fontWeight: 500, minWidth: '3.5em' }}>{p.pageviews.toLocaleString()}</span>
                                        </span>
                                    </td>
                                    <td className="num">{duration(p.avgTime)}</td>
                                    <td className="num">{p.entries.toLocaleString()}</td>
                                    <td className="num">{p.exits.toLocaleString()}</td>
                                    <td className="num" style={{ paddingRight: 20 }}>
                                        {p.bounceRate > 45 && (
                                            <AlertTriangle size={12} aria-label="High bounce rate" style={{ color: 'var(--color-warning)', marginRight: 4, verticalAlign: '-1px' }} />
                                        )}
                                        {p.bounceRate.toFixed(1)}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </ChartCard>
        </div>
    );
}

// ── Behavior: paths ──
export function BehaviorPathsView() {
    return (
        <div className="page-stack">
            <PageHeader title="User paths" subtitle="How visitors move from one page to the next." />
            <ChartCard title="Top user flows" subtitle="Page-to-page moves">
                <BarList items={data.flows.map(f => ({ label: `${f.from} → ${f.to}`, value: f.count }))} labelHeader="From → to" valueHeader="Moves" />
            </ChartCard>
            <div className="dash-grid-2">
                <ChartCard title="Top entry pages" subtitle="Where sessions start">
                    <BarList items={data.entries.map(e => ({ label: e.path, value: e.count }))} />
                </ChartCard>
                <ChartCard title="Top exit pages" subtitle="Where sessions end">
                    <BarList items={data.exits.map(e => ({ label: e.path, value: e.count }))} />
                </ChartCard>
            </div>
        </div>
    );
}

// ── Behavior: devices ──
export function BehaviorDevicesView() {
    const icons: Record<string, React.ReactNode> = {
        Mobile: <Smartphone size={14} />, Desktop: <Monitor size={14} />, Tablet: <Tablet size={14} />,
    };
    return (
        <div className="page-stack">
            <PageHeader title="Devices" subtitle="Sessions by device type, browser and operating system." />
            <div className="dash-grid-3">
                <ChartCard title="Device type" subtitle="Sessions">
                    <BarList items={data.devices.map(d => ({ ...d, icon: icons[d.label] }))} />
                </ChartCard>
                <ChartCard title="Browsers" subtitle="Sessions">
                    <BarList items={data.browsers} />
                </ChartCard>
                <ChartCard title="Operating systems" subtitle="Sessions">
                    <BarList items={data.systems} />
                </ChartCard>
            </div>
        </div>
    );
}

// ── Funnels ──
export function FunnelsView() {
    const steps = data.funnelSteps;
    const first = steps[0].visitors;
    const last = steps[steps.length - 1].visitors;
    return (
        <div className="page-stack">
            <PageHeader title="Funnels" subtitle="See where visitors drop off on the way to a goal." />
            <div className="split-grid" style={{ alignItems: 'start' }}>
                <div className="page-stack" style={{ minWidth: 0 }}>
                    <div className="stat-grid">
                        <StatCard label="Entered" icon={Users} value={first.toLocaleString()} />
                        <StatCard label="Completed" icon={Target} value={last.toLocaleString()} />
                        <StatCard label="Dropped" icon={TrendingDown} value={(first - last).toLocaleString()} />
                        <StatCard label="Conversion" icon={Percent} value={`${((last / first) * 100).toFixed(1)}%`} hint="Entered to completed" />
                    </div>
                    <ChartCard flush title={data.funnels[0].name} subtitle="Visitors who reached each step in the selected period">
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ marginTop: 6 }}>
                                <thead>
                                    <tr>
                                        <th style={{ paddingLeft: 20 }}>Step</th>
                                        <th className="num">Visitors</th>
                                        <th className="num">Step conversion</th>
                                        <th className="num" style={{ paddingRight: 20 }}>Drop-off</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {steps.map((step, i) => {
                                        const prev = i > 0 ? steps[i - 1].visitors : step.visitors;
                                        const width = Math.max((step.visitors / first) * 100, 1.5);
                                        const drop = prev - step.visitors;
                                        return (
                                            <tr key={step.name}>
                                                <td style={{ paddingLeft: 20, width: '55%', minWidth: 180 }}>
                                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minHeight: 26, padding: '0 8px' }}>
                                                        <span aria-hidden="true" style={{ position: 'absolute', inset: '0 auto 0 0', width: `${width}%`, background: 'var(--chart-bar)', borderLeft: '2px solid var(--chart-1)', borderRadius: 4 }} />
                                                        <span style={{ position: 'relative', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', fontSize: '0.75rem' }}>{i + 1}</span>
                                                        <span style={{ position: 'relative', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.name}</span>
                                                    </div>
                                                </td>
                                                <td className="num" style={{ fontWeight: 500 }}>{step.visitors.toLocaleString()}</td>
                                                <td className="num">{i === 0 ? <span className="muted">—</span> : `${((step.visitors / prev) * 100).toFixed(1)}%`}</td>
                                                <td className="num muted" style={{ paddingRight: 20 }}>
                                                    {i === 0 ? '—' : `${drop.toLocaleString()} (${((drop / prev) * 100).toFixed(1)}%)`}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </ChartCard>
                </div>

                <ChartCard flush title="Your funnels" subtitle={`${data.funnels.length} funnels`}>
                    <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, borderTop: '1px solid var(--color-border)' }}>
                        {data.funnels.map((f, i) => (
                            <li key={f.id} style={{
                                display: 'flex', flexDirection: 'column', gap: 1, padding: '8px 16px',
                                borderBottom: '1px solid var(--color-border)',
                                background: i === 0 ? 'var(--color-bg-hover)' : undefined,
                                boxShadow: i === 0 ? 'inset 2px 0 0 var(--color-accent-primary)' : undefined,
                            }}>
                                <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{f.name}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{f.stepsCount} steps · {f.description}</span>
                            </li>
                        ))}
                    </ul>
                </ChartCard>
            </div>
        </div>
    );
}

// ── Heatmaps ──
function heatColor(intensity: number): string {
    if (intensity < 0.25) return 'rgba(0, 100, 255, 0.4)';
    if (intensity < 0.5) return 'rgba(0, 255, 100, 0.5)';
    if (intensity < 0.75) return 'rgba(255, 255, 0, 0.6)';
    return 'rgba(255, 50, 0, 0.8)';
}

const HEATMAP_TYPES = [
    { value: 'click', label: 'Clicks', icon: MousePointer2 },
    { value: 'scroll', label: 'Scroll', icon: ArrowDown },
] as const;
const VIEWPORTS = [
    { value: 'desktop', label: 'Desktop', icon: Monitor },
    { value: 'tablet', label: 'Tablet', icon: Tablet },
    { value: 'mobile', label: 'Mobile', icon: Smartphone },
] as const;

export function HeatmapsView() {
    const [type, setType] = useState<'click' | 'scroll'>('click');
    const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
    const page = data.heatmapPages[0];
    const max = Math.max(...data.heatmapPoints.map(p => p.count));

    return (
        <div className="page-stack">
            <PageHeader
                title="Heatmaps"
                subtitle="Where visitors click and how far they scroll, over the last 30 days."
                actions={<>
                    <Segmented label="Heatmap type" options={HEATMAP_TYPES} value={type} onChange={setType} />
                    <Segmented label="Device" options={VIEWPORTS} value={viewport} onChange={setViewport} />
                </>}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 240px', minWidth: 0, maxWidth: '100%' }}>
                    <ChartCard title="Pages" subtitle="By clicks" flush>
                        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, borderTop: '1px solid var(--color-border)' }}>
                            {data.heatmapPages.map((p, i) => (
                                <li key={p.path} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                                    padding: '8px 20px', minHeight: 36, fontSize: '0.8125rem',
                                    borderBottom: '1px solid var(--color-border)',
                                    background: i === 0 ? 'var(--color-bg-hover)' : undefined,
                                    boxShadow: i === 0 ? 'inset 2px 0 0 var(--color-text-primary)' : undefined,
                                    fontWeight: i === 0 ? 500 : 400,
                                }}>
                                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</span>
                                    <span style={{ flexShrink: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', fontWeight: 400 }}>
                                        {p.clicks.toLocaleString()} clicks
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </ChartCard>
                </div>

                <div style={{ flex: '3 1 420px', minWidth: 0, maxWidth: '100%' }}>
                    <ChartCard
                        title={type === 'click' ? 'Click heatmap' : 'Scroll depth'}
                        subtitle={page.path}
                        action={<span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {page.clicks.toLocaleString()} interactions
                        </span>}
                    >
                        {type === 'click' ? (
                            <div style={{
                                position: 'relative', width: '100%',
                                aspectRatio: viewport === 'mobile' ? '9/16' : viewport === 'tablet' ? '3/4' : '4/3',
                                maxWidth: viewport === 'mobile' ? 300 : viewport === 'tablet' ? 480 : '100%',
                                margin: '0 auto', background: 'var(--color-bg-secondary)',
                                borderRadius: 'var(--radius-md)', overflow: 'hidden',
                            }}>
                                {/* A wireframe of the page under the clicks */}
                                <div aria-hidden="true" style={{ position: 'absolute', inset: 0, padding: '4% 6%', display: 'flex', flexDirection: 'column', gap: '4%' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ width: '18%', height: 10, borderRadius: 3, background: 'var(--color-bg-tertiary)' }} />
                                        <span style={{ width: '16%', height: 10, borderRadius: 3, background: 'var(--color-bg-tertiary)' }} />
                                    </div>
                                    <span style={{ alignSelf: 'center', width: '60%', height: 14, borderRadius: 3, background: 'var(--color-bg-tertiary)', marginTop: '6%' }} />
                                    <span style={{ alignSelf: 'center', width: '24%', height: 18, borderRadius: 4, background: 'var(--color-bg-tertiary)' }} />
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4%', marginTop: '8%' }}>
                                        {[0, 1, 2].map(i => <span key={i} style={{ height: 40, borderRadius: 4, background: 'var(--color-bg-tertiary)' }} />)}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6%', marginTop: '10%' }}>
                                        {[0, 1].map(i => <span key={i} style={{ height: 56, borderRadius: 4, background: 'var(--color-bg-tertiary)' }} />)}
                                    </div>
                                </div>
                                {data.heatmapPoints.map((p, i) => (
                                    <div key={i} style={{
                                        position: 'absolute', left: `${p.x - 5}%`, top: `${p.y - 5}%`, width: '10%', height: '10%',
                                        background: heatColor(p.count / max), borderRadius: '50%', filter: 'blur(10px)', pointerEvents: 'none',
                                    }} />
                                ))}
                            </div>
                        ) : (
                            <div style={{ padding: 'var(--space-md) 0' }}>
                                {data.scrollDepth.map(p => {
                                    const share = p.count / page.visitors;
                                    return (
                                        <div key={p.y} style={{ marginBottom: 'var(--space-md)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 'var(--space-xs)', fontSize: '0.875rem' }}>
                                                <span>{p.y}% scroll depth</span>
                                                <span style={{ color: 'var(--color-text-secondary)' }}>{p.count.toLocaleString()} visitors ({Math.round(share * 100)}%)</span>
                                            </div>
                                            <div style={{ height: 24, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${share * 100}%`, background: heatColor(1 - p.y / 100), borderRadius: 'var(--radius-md)' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Low</span>
                            <div style={{ width: 150, maxWidth: '50%', height: 8, borderRadius: 'var(--radius-full)', background: 'linear-gradient(to right, rgba(0,100,255,0.4), rgba(0,255,100,0.5), rgba(255,255,0,0.6), rgba(255,50,0,0.8))' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>High</span>
                        </div>
                    </ChartCard>
                </div>
            </div>
        </div>
    );
}

// ── Sessions ──
/** A stand-in for the replay player: a page wireframe with a moving cursor. */
function ReplayFrame({ playing }: { playing: boolean }) {
    return (
        <div aria-hidden="true" className="demo-replay" data-playing={playing} style={{
            position: 'relative', aspectRatio: '16/10', background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden',
        }}>
            <div style={{ position: 'absolute', inset: 0, padding: '5% 7%', display: 'flex', flexDirection: 'column', gap: '5%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ width: '16%', height: 10, borderRadius: 3, background: 'var(--color-bg-tertiary)' }} />
                    <span style={{ width: '30%', height: 10, borderRadius: 3, background: 'var(--color-bg-tertiary)' }} />
                </div>
                <span style={{ width: '45%', height: 16, borderRadius: 3, background: 'var(--color-bg-tertiary)', marginTop: '4%' }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4%', flex: 1 }}>
                    {[0, 1, 2].map(i => (
                        <span key={i} style={{
                            borderRadius: 6, background: 'var(--color-bg-tertiary)',
                            outline: i === 1 ? '1px solid var(--color-border-hover)' : undefined,
                        }} />
                    ))}
                </div>
            </div>
            <svg className="demo-replay-cursor" width="16" height="16" viewBox="0 0 24 24" style={{ position: 'absolute', left: '22%', top: '30%' }}>
                <path d="M4 2l16 9-7 2-3 7z" fill="var(--color-text-primary)" stroke="var(--color-bg-card)" strokeWidth="1.5" />
            </svg>
        </div>
    );
}

export function SessionsView() {
    const [selected, setSelected] = useState<string>(data.recordings[0].id);
    const [playing, setPlaying] = useState(false);
    const rec = data.recordings.find(r => r.id === selected)!;
    return (
        <div className="page-stack">
            <PageHeader title="Sessions" subtitle="Replay how visitors move through your site." />
            <div className="split-grid" style={{ alignItems: 'start' }}>
                <ChartCard
                    title={rec.url}
                    subtitle={`${minutesAgo(rec.startedAt)} · ${duration(rec.duration)} · ${rec.eventsCount} events`}
                >
                    <ReplayFrame playing={playing} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                        <button type="button" className="btn btn-secondary" onClick={() => setPlaying(p => !p)}
                            aria-label={playing ? 'Pause replay' : 'Play replay'} style={{ padding: '6px 10px' }}>
                            {playing ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
                            <div className="demo-replay-progress" data-playing={playing} style={{ height: '100%', background: 'var(--chart-1)' }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{duration(rec.duration)}</span>
                    </div>
                </ChartCard>

                <ChartCard flush title="Recordings" subtitle={`${data.recordings.length} sessions`}>
                    <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, borderTop: '1px solid var(--color-border)' }}>
                        {data.recordings.map(r => {
                            const Icon = DEVICE_ICONS[r.device];
                            const active = r.id === selected;
                            return (
                                <li key={r.id} style={{
                                    borderBottom: '1px solid var(--color-border)',
                                    background: active ? 'var(--color-bg-hover)' : undefined,
                                    boxShadow: active ? 'inset 2px 0 0 var(--color-accent-primary)' : undefined,
                                }}>
                                    <button type="button" onClick={() => { setSelected(r.id); setPlaying(false); }} aria-current={active ? 'true' : undefined}
                                        style={{
                                            width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                                            background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                                            color: 'var(--color-text-primary)', fontSize: '0.8125rem',
                                        }}>
                                        <Icon size={14} aria-label={r.device} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{r.url}</span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                                {duration(r.duration)} · {r.eventsCount} events
                                            </span>
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{minutesAgo(r.startedAt)}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </ChartCard>
            </div>
        </div>
    );
}

// ── AI insights ──
const INSIGHT_ICONS: Record<string, React.ElementType> = {
    traffic: TrendingUp, page: FileText, technical: Zap, funnel: Filter, opportunity: Target,
};
const PRIORITY_BADGE = { high: 'badge badge-error', medium: 'badge badge-warning', low: 'badge badge-success' } as const;
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;

export function InsightsView() {
    const [open, setOpen] = useState<string | null>(data.insights[0].id);
    const last = data.trafficData[data.trafficData.length - 1];
    const chartData = [
        ...data.trafficData.map((r, i, all) => {
            const window = all.slice(Math.max(0, i - 6), i + 1);
            return { date: r.date, actual: r.pageviews, trend: Math.round(window.reduce((s, w) => s + w.pageviews, 0) / window.length) };
        }),
        ...data.forecast.map(f => {
            const d = new Date(`${last.date}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() + f.offset);
            return { date: d.toISOString().slice(0, 10), forecast: f.predicted };
        }),
    ];
    const counts = { high: 0, medium: 0, low: 0 };
    data.insights.forEach(i => { counts[i.priority]++; });

    return (
        <div className="page-stack">
            <PageHeader title="AI insights" subtitle="A daily report on what changed on your site and what to do about it" />
            <div className="split-grid">
                <ChartCard title="Traffic forecast" subtitle="Pageviews per day, with the trend and a 5-day forecast">
                    <TimeSeriesChart
                        data={chartData}
                        xKey="date"
                        height={300}
                        series={[
                            { key: 'actual', label: 'Pageviews' },
                            { key: 'trend', label: '7-day average', muted: true },
                            { key: 'forecast', label: 'Forecast', muted: true },
                        ]}
                    />
                </ChartCard>
                <ChartCard title="Insight summary" subtitle="Today's report by priority">
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {(['high', 'medium', 'low'] as const).map(p => (
                            <li key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                                <span className={PRIORITY_BADGE[p]}>{PRIORITY_LABEL[p]} priority</span>
                                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{counts[p]}</span>
                            </li>
                        ))}
                    </ul>
                </ChartCard>
            </div>
            <ChartCard title="All insights" subtitle={`${data.insights.length} from today's report`} flush>
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                    {data.insights.map(insight => {
                        const Icon = INSIGHT_ICONS[insight.type] || Sparkles;
                        const isOpen = open === insight.id;
                        return (
                            <li key={insight.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : insight.id)}
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', padding: '12px 20px',
                                        background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit',
                                    }}>
                                    <Icon size={16} aria-hidden="true" style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }} />
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{insight.title}</span>
                                            <span className={PRIORITY_BADGE[insight.priority]}>{PRIORITY_LABEL[insight.priority]}</span>
                                        </span>
                                        <span style={{ display: 'block', marginTop: 2, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{insight.description}</span>
                                    </span>
                                    <ChevronRight size={16} aria-hidden="true" style={{
                                        color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2,
                                        transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform var(--transition-fast)',
                                    }} />
                                </button>
                                {isOpen && (
                                    <div style={{ padding: '0 20px 14px 48px' }}>
                                        <div style={{ padding: '8px 12px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Recommendation</span>
                                            <p style={{ fontSize: '0.8125rem', margin: '2px 0 0' }}>{insight.recommendation}</p>
                                        </div>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </ChartCard>
        </div>
    );
}

// ── Reports ──
export function ReportsView() {
    const datasets = [
        { name: 'Sessions', description: 'One row per visit: start and end time, source, UTM source, browser, screen width and language.' },
        { name: 'Events', description: 'One row per tracked event: type, page URL, referrer and time.' },
    ];
    return (
        <div className="page-stack">
            <PageHeader title="Reports" subtitle="Download your raw data as CSV." />
            <ChartCard flush title="CSV exports" subtitle="Each file holds the most recent rows, newest first.">
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, borderTop: '1px solid var(--color-border)' }}>
                    {datasets.map((d, i) => (
                        <li key={d.name} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flexWrap: 'wrap',
                            borderTop: i ? '1px solid var(--color-border)' : undefined,
                        }}>
                            <FileText size={16} aria-hidden="true" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{d.name}</div>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>{d.description}</div>
                            </div>
                            <button type="button" className="btn btn-secondary" disabled title="Downloads are off in the demo"
                                style={{ padding: '6px 12px', fontSize: '0.8125rem', flexShrink: 0 }}>
                                <Download size={14} /> Download CSV
                            </button>
                        </li>
                    ))}
                </ul>
            </ChartCard>
        </div>
    );
}

// ── Monitoring: errors ──
export function ErrorsView() {
    const total = data.errors.reduce((s, e) => s + e.count, 0);
    return (
        <div className="page-stack">
            <PageHeader title="Errors" subtitle="JavaScript errors your visitors hit, grouped by message." />
            <div className="stat-grid">
                <StatCard label="Total errors" icon={AlertTriangle} value={total.toLocaleString()} />
                <StatCard label="Unique errors" icon={Hash} value={data.errors.length} hint="Grouped by message and source" />
            </div>
            <ChartCard title="Error log" subtitle="Most frequent first" flush action={<SearchField label="Search errors" />}>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: 20 }}>Message</th>
                                <th>Source</th>
                                <th className="num">Count</th>
                                <th className="num" style={{ paddingRight: 20 }}>Last seen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.errors.map(e => (
                                <tr key={e.message}>
                                    <td style={{ paddingLeft: 20, maxWidth: 420 }}>
                                        <div title={e.message} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.message}</div>
                                    </td>
                                    <td className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{e.source}</td>
                                    <td className="num" style={{ fontWeight: 500 }}>{e.count}</td>
                                    <td className="num muted" style={{ paddingRight: 20, whiteSpace: 'nowrap' }}>{e.lastSeen}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </ChartCard>
        </div>
    );
}

// ── Monitoring: performance ──
const VITAL_ICONS: Record<string, React.ElementType> = { lcp: LayoutDashboard, fcp: Paintbrush, cls: Layers, fid: MousePointer2, ttfb: Server };
const STATUS_BADGE: Record<string, string> = { Good: 'badge badge-success', 'Needs work': 'badge badge-warning', Poor: 'badge badge-error' };

export function PerformanceView() {
    return (
        <div className="page-stack">
            <PageHeader title="Performance" subtitle="Core Web Vitals and page load times from 2,520 visitor samples" />
            <div className="stat-grid">
                {data.vitals.map(v => {
                    const Icon = (VITAL_ICONS[v.key] || Gauge) as typeof Gauge;
                    return (
                        <StatCard key={v.key} label={v.label} icon={Icon} value={v.value}
                            hint={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span className={STATUS_BADGE[v.status]} style={{ whiteSpace: 'nowrap' }}>{v.status}</span>
                                <span>Good ≤ {v.good}</span>
                            </span>} />
                    );
                })}
                <StatCard label="Average page load" icon={Timer} value="2.4s" hint="Until the load event" />
            </div>
            <ChartCard title="By page" subtitle="Status from the slower of LCP and FCP" flush>
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
                            {data.perfByPage.map(p => (
                                <tr key={p.path}>
                                    <td style={{ paddingLeft: 20 }}>{p.path}</td>
                                    <td className="num">{p.lcp}</td>
                                    <td className="num">{p.fcp}</td>
                                    <td><span className={STATUS_BADGE[p.status]} style={{ whiteSpace: 'nowrap' }}>{p.status}</span></td>
                                    <td className="num muted" style={{ paddingRight: 20 }}>{p.count.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </ChartCard>
        </div>
    );
}

// ── Monitoring: forms ──
export function FormsView() {
    const total = data.forms.reduce((s, f) => s + f.submissions, 0);
    return (
        <div className="page-stack">
            <PageHeader title="Forms" subtitle="Submissions for every form on your site. Field values are never stored." />
            <div className="stat-grid">
                <StatCard label="Submissions" icon={Send} value={total.toLocaleString()} />
                <StatCard label="Forms" icon={Hash} value={data.forms.length} hint="With at least one submission" />
            </div>
            <ChartCard title="All forms" subtitle="By submissions" flush action={<SearchField label="Search forms" />}>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: 20 }}>Form</th>
                                <th>Action</th>
                                <th>Method</th>
                                <th className="num">Fields</th>
                                <th className="num" style={{ paddingRight: 20 }}>Submissions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.forms.map(f => (
                                <tr key={f.id}>
                                    <td style={{ paddingLeft: 20, whiteSpace: 'nowrap' }}>
                                        <span style={{ fontWeight: 500 }}>{f.name}</span>
                                        <span className="muted" style={{ marginLeft: 6, fontSize: '0.75rem' }}>#{f.id}</span>
                                    </td>
                                    <td className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{f.action}</td>
                                    <td><span className="badge">{f.method}</span></td>
                                    <td className="num muted">{f.fields}</td>
                                    <td className="num" style={{ paddingRight: 20, fontWeight: 500 }}>{f.submissions.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </ChartCard>
        </div>
    );
}

// ── Monitoring: rage clicks ──
export function RageClicksView() {
    const total = data.rageClicks.reduce((s, r) => s + r.count, 0);
    const pages = new Set(data.rageClicks.map(r => r.path)).size;
    return (
        <div className="page-stack">
            <PageHeader title="Rage clicks" subtitle="Elements visitors click over and over when something does not respond." />
            <div className="stat-grid">
                <StatCard label="Rage clicks" icon={MousePointerClick} value={total} />
                <StatCard label="Elements" icon={Hash} value={data.rageClicks.length} />
                <StatCard label="Pages affected" icon={FileText} value={pages} />
            </div>
            <ChartCard title="Frustrated elements" subtitle="Most rage clicks first" flush action={<SearchField label="Search elements or pages" />}>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: 20 }}>Element</th>
                                <th>Page</th>
                                <th className="num">Rage clicks</th>
                                <th className="num" style={{ paddingRight: 20 }}>Avg. clicks per burst</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rageClicks.map(r => (
                                <tr key={r.element}>
                                    <td style={{ paddingLeft: 20, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{r.element}</td>
                                    <td className="muted">{r.path}</td>
                                    <td className="num" style={{ fontWeight: 500 }}>{r.count}</td>
                                    <td className="num muted" style={{ paddingRight: 20 }}>{r.avg}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </ChartCard>
        </div>
    );
}

// ── Team ──
export function TeamView() {
    return (
        <div className="page-stack">
            <PageHeader title="Team" subtitle="People who can see this workspace." />
            <ChartCard title="Members" subtitle="1 member" flush>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr><th style={{ paddingLeft: 20 }}>Member</th><th>Role</th><th style={{ paddingRight: 20 }}>Status</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ paddingLeft: 20 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span aria-hidden="true" style={{
                                            width: 28, height: 28, borderRadius: '50%', background: 'var(--color-accent-primary)', color: 'white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700,
                                        }}>D</span>
                                        <span>
                                            <span style={{ display: 'block', fontWeight: 500 }}>Demo User</span>
                                            <span className="muted" style={{ fontSize: '0.75rem' }}>demo@example.com</span>
                                        </span>
                                    </div>
                                </td>
                                <td><span className="badge">Owner</span></td>
                                <td style={{ paddingRight: 20 }}><span className="badge badge-success">Active</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </ChartCard>
        </div>
    );
}

// ── Settings ──
export function SettingsView() {
    const rows = [
        { name: 'Session recording', detail: 'Record visits so you can replay them.', on: true },
        { name: 'Mask form inputs', detail: 'Typed text is replaced with asterisks in replays.', on: true },
        { name: 'Respect Do Not Track', detail: 'Skip visitors whose browser sends Do Not Track or GPC.', on: true },
    ];
    return (
        <div className="page-stack">
            <PageHeader title="Settings" subtitle="demo-site.com" />
            <ChartCard title="Tracking" subtitle="What the script collects on this site" flush>
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                    {rows.map(r => (
                        <li key={r.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 20px', borderTop: '1px solid var(--color-border)' }}>
                            <span style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500 }}>{r.name}</span>
                                <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{r.detail}</span>
                            </span>
                            <span role="switch" aria-checked={r.on} aria-label={r.name} aria-readonly="true" style={{
                                width: 36, height: 20, flexShrink: 0, borderRadius: 10, position: 'relative',
                                background: r.on ? 'var(--color-success)' : 'var(--color-bg-tertiary)',
                            }}>
                                <span style={{ position: 'absolute', top: 2, right: r.on ? 2 : undefined, left: r.on ? undefined : 2, width: 16, height: 16, borderRadius: '50%', background: 'white' }} />
                            </span>
                        </li>
                    ))}
                </ul>
            </ChartCard>
        </div>
    );
}
