'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { Clock, Eye, FileDown, MousePointer2, Users, Video, X } from 'lucide-react';
import { share, type SharedDashboard, type SharedRecording } from '@/lib/api';
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { BarList } from '@/components/charts/BarList';
import { duration } from '@/components/charts/format';
import type { ReplayEvent } from '@/components/ScreenReplay';

// rrweb needs the browser; load the player only when a recording is opened.
const ScreenReplay = dynamic(() => import('@/components/ScreenReplay'), {
    ssr: false,
    loading: () => <div className="skeleton" style={{ width: '100%', height: '400px' }} />,
});

const PERIODS = [7, 30, 90] as const;

const CHANNEL_LABELS: Record<string, string> = {
    organic: 'Organic search', social: 'Social', direct: 'Direct', referral: 'Referral', email: 'Email', paid: 'Paid',
};

function change(now: number, before: number): number | undefined {
    return before > 0 ? ((now - before) / before) * 100 : undefined;
}

/** A client link: one site's read-only dashboard in the agency's branding. */
export default function SharedDashboardPage() {
    const { token } = useParams<{ token: string }>();
    const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
    const [data, setData] = useState<SharedDashboard | null>(null);
    const [failed, setFailed] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        share.dashboard(token, days).then(result => {
            if (cancelled) return;
            if (result.data) {
                setData(result.data);
                setFailed(null);
            } else {
                setFailed(result.status === 404
                    ? "This link doesn't work. It may have been switched off or expired. Ask whoever sent it for a new one."
                    : result.error || 'Something went wrong. Try again in a minute.');
            }
        });
        return () => { cancelled = true; };
    }, [token, days]);

    useEffect(() => {
        if (data) document.title = `${data.site.name} · ${data.brand.name || 'Website report'}`;
    }, [data]);

    if (failed && !data) {
        return (
            <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--color-bg-primary)' }}>
                <div className="card" style={{ maxWidth: 440, padding: 24, textAlign: 'center' }}>
                    <h1 style={{ fontSize: '1.125rem', margin: '0 0 8px' }}>Report unavailable</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>{failed}</p>
                </div>
            </main>
        );
    }

    const accent = data?.brand.color || 'var(--color-primary)';
    const o = data?.overview;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
            <header style={{ borderTop: `4px solid ${accent}`, borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
                <div style={{ maxWidth: 1120, margin: '0 auto', padding: '16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    {data?.brand.logoUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={data.brand.logoUrl} alt={data.brand.name || 'Logo'} style={{ maxHeight: 40, maxWidth: 180, objectFit: 'contain' }} />
                        : data?.brand.name && <span style={{ fontWeight: 600, fontSize: '1rem', color: accent }}>{data.brand.name}</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>{data?.site.name || ' '}</h1>
                        {data && data.site.name !== data.site.domain && (
                            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{data.site.domain}</div>
                        )}
                    </div>
                    <div role="group" aria-label="Period" style={{ display: 'flex', gap: 4 }}>
                        {PERIODS.map(p => (
                            <button
                                key={p}
                                className={`btn ${p === days ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '6px 12px', fontSize: '0.8125rem', ...(p === days ? { background: accent, borderColor: accent } : {}) }}
                                aria-pressed={p === days}
                                onClick={() => setDays(p)}
                            >
                                {p} days
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 16px 40px' }} className="page-stack">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                    <StatCard label="Visitors" icon={Users} loading={!o} value={o?.visitors.toLocaleString()} change={o && change(o.visitors, o.visitorsBefore)} hint={`vs the ${days} days before`} />
                    <StatCard label="Page views" icon={Eye} loading={!o} value={o?.pageviews.toLocaleString()} />
                    <StatCard label="Bounce rate" icon={MousePointer2} loading={!o} value={`${Number(o?.bounceRate ?? 0).toFixed(1)}%`} hint="Left after one page" />
                    <StatCard label="Average visit" icon={Clock} loading={!o} value={duration(o?.avgDuration ?? 0)} />
                </div>

                <ChartCard title="Visitors over time" loading={!data}>
                    {data && (
                        <TimeSeriesChart
                            data={data.series}
                            xKey="bucket"
                            series={[{ key: 'visitors', label: 'Visitors' }, { key: 'pageviews', label: 'Page views' }]}
                        />
                    )}
                </ChartCard>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                    <ChartCard title="Where visitors come from" loading={!data} height={200}>
                        {data && (
                            <BarList
                                labelHeader="Channel"
                                valueHeader="Visits"
                                items={data.channels.map(c => ({ label: CHANNEL_LABELS[c.source_type] || c.source_type, value: c.count }))}
                            />
                        )}
                    </ChartCard>
                    <ChartCard title="Top referring sites" loading={!data} height={200}>
                        {data && (
                            <BarList
                                labelHeader="Site"
                                valueHeader="Visits"
                                items={data.referrers.map(r => ({ label: r.site, value: r.sessions }))}
                                emptyText="No other sites sent visitors in this period"
                            />
                        )}
                    </ChartCard>
                </div>

                <ChartCard title="Most viewed pages" loading={!data} height={200}>
                    {data && (
                        <BarList labelHeader="Page" valueHeader="Views" items={data.pages.map(p => ({ label: p.path, value: p.views }))} />
                    )}
                </ChartCard>

                {data && (
                    <ChartCard
                        title={data.latestReport ? `Report: ${data.latestReport.monthLabel || data.latestReport.month}` : 'Monthly report'}
                        subtitle={data.latestReport ? `Sent ${new Date(data.latestReport.sentAt).toLocaleDateString()}` : 'Last month, built on request'}
                        action={(
                            <a className="btn btn-secondary" href={share.reportPdfUrl(token)} target="_blank" rel="noopener noreferrer">
                                <FileDown size={14} /> PDF
                            </a>
                        )}
                    >
                        {data.latestReport?.summary.length ? (
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.875rem', lineHeight: 1.6 }}>
                                {data.latestReport.summary.map((line, i) => <li key={i}>{line}</li>)}
                            </ul>
                        ) : (
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                                No report has been sent yet. The PDF has last month&apos;s numbers.
                            </p>
                        )}
                    </ChartCard>
                )}

                {data?.permissions.recordings && <SharedRecordings token={token} />}

                {data?.brand.showPoweredBy && (
                    <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '8px 0 0' }}>
                        Powered by <a href="https://thravic.com" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>Thravic</a>
                    </p>
                )}
            </main>
        </div>
    );
}

function SharedRecordings({ token }: { token: string }) {
    const [list, setList] = useState<SharedRecording[] | null>(null);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [open, setOpen] = useState<{ id: string; events: ReplayEvent[] | null; rrweb: boolean } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        share.recordings(token, page).then(result => {
            if (cancelled) return;
            if (result.data) {
                setList(result.data.recordings);
                setTotal(result.data.total);
                setPageSize(result.data.pageSize);
            } else {
                setError(result.error || 'Could not load recordings');
            }
        });
        return () => { cancelled = true; };
    }, [token, page]);

    const play = async (id: string) => {
        setOpen({ id, events: null, rrweb: true });
        const result = await share.recording(token, id);
        if (result.data) setOpen({ id, events: result.data.events as ReplayEvent[], rrweb: result.data.format === 'rrweb' });
        else {
            setOpen(null);
            setError(result.error || 'Could not open the recording');
        }
    };

    return (
        <ChartCard
            flush
            title="Session recordings"
            subtitle="Replays of real visits, with typed text hidden."
            loading={list === null && !error}
            height={160}
        >
            {open && (
                <div style={{ padding: '0 20px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                        <button className="btn btn-ghost" onClick={() => setOpen(null)}><X size={14} /> Close</button>
                    </div>
                    {open.events === null
                        ? <div className="skeleton" style={{ width: '100%', height: 400 }} />
                        : open.rrweb && open.events.length > 1
                            ? <ScreenReplay events={open.events} />
                            : <div className="empty-note">This recording can&apos;t be replayed here.</div>}
                </div>
            )}
            {error && <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.8125rem', padding: '0 20px' }}>{error}</p>}
            {list && (list.length ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--color-border)' }}>
                    {list.map((r, i) => (
                        <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderTop: i ? '1px solid var(--color-border)' : undefined, fontSize: '0.8125rem', flexWrap: 'wrap' }}>
                            <Video size={14} aria-hidden="true" style={{ color: 'var(--color-text-secondary)' }} />
                            <span style={{ flex: '1 1 220px', minWidth: 0, overflowWrap: 'anywhere' }}>{r.url || 'Unknown page'}</span>
                            <span style={{ color: 'var(--color-text-secondary)' }}>
                                {r.startedAt ? new Date(r.startedAt).toLocaleString() : ''} · {duration(r.duration ?? 0)}{r.device ? ` · ${r.device}` : ''}
                            </span>
                            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8125rem' }} onClick={() => play(r.id)}>Watch</button>
                        </li>
                    ))}
                </ul>
            ) : <div className="empty-note" style={{ padding: '0 20px 20px' }}>No recordings in this period.</div>)}
            {total > pageSize && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 20px' }}>
                    <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
                    <button className="btn btn-secondary" disabled={page * pageSize >= total} onClick={() => setPage(page + 1)}>Next</button>
                </div>
            )}
        </ChartCard>
    );
}
