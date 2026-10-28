'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle, ArrowLeft, FileInput, FileText, MessageSquare, MousePointerClick, Search, Sparkles, Video,
    type LucideIcon,
} from 'lucide-react';
import { useDomain } from '@/contexts/DomainContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { isApp } from '@/lib/platform';
import {
    visitors as visitorsApi,
    type TimelineType, type VisitorProfile, type VisitorSummary,
} from '@/lib/api';

const TIMELINE_ICON: Record<TimelineType, { icon: LucideIcon; color: string; label: string }> = {
    pageview: { icon: FileText, color: 'var(--color-text-secondary)', label: 'Viewed' },
    form: { icon: FileInput, color: 'var(--color-text-secondary)', label: 'Submitted form' },
    error: { icon: AlertTriangle, color: 'var(--color-error)', label: 'Error' },
    rage_click: { icon: MousePointerClick, color: 'var(--color-warning)', label: 'Rage click' },
    feedback: { icon: MessageSquare, color: 'var(--color-success)', label: 'Feedback' },
    event: { icon: Sparkles, color: 'var(--color-text-secondary)', label: 'Event' },
};

function dateTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function path(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.pathname + parsed.search;
    } catch {
        return url;
    }
}

/** The best name we have for a visitor: who they are if the site said, else a short id. */
function displayName(visitor: VisitorSummary): string {
    return visitor.name || visitor.email || visitor.userId || `Visitor ${visitor.visitorId.slice(0, 8)}`;
}

function place(visitor: { city: string | null; country: string | null }): string {
    return [visitor.city, visitor.country].filter(Boolean).join(', ');
}

function readVisitorParam(): string | null {
    return new URLSearchParams(window.location.search).get('visitor');
}

export default function VisitorsPage() {
    const { selectedDomainId, selectedDomain, loading: domainLoading } = useDomain();
    const [openId, setOpenId] = useState<string | null>(null);

    // ?visitor=<id> opens a profile, so it can be linked to and the back button works
    useEffect(() => {
        setOpenId(readVisitorParam());
        const onPop = () => setOpenId(readVisitorParam());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const open = useCallback((id: string | null) => {
        const url = new URL(window.location.href);
        if (id) url.searchParams.set('visitor', id);
        else url.searchParams.delete('visitor');
        window.history.pushState(null, '', url);
        setOpenId(id);
    }, []);

    if (!selectedDomainId && !domainLoading) {
        return (
            <div className="page-stack">
                <PageHeader title="Visitors" subtitle="Everyone who has visited, most recent first." />
                <div className="card empty-note">Select a website to see its visitors.</div>
            </div>
        );
    }

    return openId && selectedDomainId
        ? <Profile domainId={selectedDomainId} visitorId={openId} app={isApp(selectedDomain)} onBack={() => open(null)} />
        : <VisitorList domainId={selectedDomainId} onOpen={open} />;
}

function VisitorList({ domainId, onOpen }: { domainId: string | null; onOpen: (id: string) => void }) {
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [list, setList] = useState<VisitorSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Search as the user types, once they pause
    useEffect(() => {
        const timer = window.setTimeout(() => setQuery(search.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        if (!domainId) return;
        let cancelled = false;
        setLoading(true);
        visitorsApi.list(domainId, query || undefined).then(({ data, error }) => {
            if (cancelled) return;
            setList(data?.visitors ?? []);
            setError(data ? null : error || 'Could not load visitors');
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [domainId, query]);

    return (
        <div className="page-stack">
            <PageHeader
                title="Visitors"
                subtitle="Everyone who has visited, most recent first. Open one to see their sessions and what they did."
            />

            <ChartCard
                flush
                title="Recent visitors"
                action={
                    <label style={{ position: 'relative', display: 'block', width: 260, maxWidth: '100%' }}>
                        <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            className="input"
                            type="search"
                            aria-label="Search visitors"
                            placeholder="Name, email, user or visitor id"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ paddingLeft: 30 }}
                        />
                    </label>
                }
            >
                {error ? (
                    <div role="alert" className="empty-note" style={{ color: 'var(--color-error)' }}>{error}</div>
                ) : loading ? (
                    <div className="skeleton" style={{ height: 200, margin: '0 20px 20px' }} />
                ) : list.length === 0 ? (
                    <div className="empty-note">{query ? 'No visitors match that search.' : 'No visitors yet.'}</div>
                ) : (
                    <div style={{ overflowX: 'auto', marginTop: 6 }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: 20 }}>Visitor</th>
                                    <th>Location</th>
                                    <th>Device</th>
                                    <th className="num">Sessions</th>
                                    <th className="num">Pages</th>
                                    <th className="num" style={{ paddingRight: 20 }}>Last seen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map(visitor => (
                                    <tr key={visitor.id}>
                                        <td style={{ paddingLeft: 20, maxWidth: 280 }}>
                                            <button
                                                type="button"
                                                onClick={() => onOpen(visitor.id)}
                                                style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 500, color: 'var(--color-text-primary)', cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: 'var(--color-border)' }}
                                            >
                                                {displayName(visitor)}
                                            </button>
                                            {visitor.userId && <span className="badge" style={{ marginLeft: 6 }}>Identified</span>}
                                        </td>
                                        <td className="muted">{place(visitor) || '–'}</td>
                                        <td className="muted">{[visitor.device, visitor.os].filter(Boolean).join(' · ') || '–'}</td>
                                        <td className="num">{visitor.sessions}</td>
                                        <td className="num">{visitor.pageviews}</td>
                                        <td className="num muted" style={{ paddingRight: 20, whiteSpace: 'nowrap' }}>{dateTime(visitor.lastSeen)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </ChartCard>

            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                Visitors are anonymous unless your site tells Thravic who they are with <code>TF(&apos;identify&apos;, userId, {'{'} email, name {'}'})</code>.
            </p>
        </div>
    );
}

function Profile({ domainId, visitorId, app, onBack }: { domainId: string; visitorId: string; app: boolean; onBack: () => void }) {
    const [data, setData] = useState<VisitorProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        visitorsApi.get(domainId, visitorId).then(({ data, error }) => {
            if (cancelled) return;
            setData(data ?? null);
            setError(data ? null : error || 'Could not load this visitor');
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [domainId, visitorId]);

    const back = (
        <button type="button" className="btn btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} /> All visitors
        </button>
    );

    if (loading || !data) {
        return (
            <div className="page-stack">
                <PageHeader title="Visitor" actions={back} />
                {error
                    ? <div role="alert" className="card" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</div>
                    : <div className="skeleton" style={{ height: 260 }} />}
            </div>
        );
    }

    const { visitor, sessions, timeline } = data;
    const facts: [string, string | null][] = [
        ['User id', visitor.userId],
        ['Email', visitor.email],
        ['First seen', dateTime(visitor.firstSeen)],
        ['Last seen', dateTime(visitor.lastSeen)],
        ['Sessions', String(visitor.sessions)],
        ['Pages viewed', String(visitor.pageviews)],
        ['Location', place(visitor) || null],
        ['Device', [visitor.device, visitor.deviceModel, visitor.os].filter(Boolean).join(' · ') || null],
        ['First came from', visitor.source],
        ['Visitor id', visitor.visitorId],
    ];

    return (
        <div className="page-stack">
            <PageHeader
                title={displayName(visitor)}
                subtitle={visitor.userId ? 'Identified by your site.' : 'Anonymous visitor.'}
                actions={back}
            />

            <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px 24px' }}>
                {facts.filter(([, value]) => value).map(([label, value]) => (
                    <div key={label} style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{label}</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value ?? undefined}>{value}</div>
                    </div>
                ))}
            </div>

            <ChartCard flush title="Sessions" subtitle={`${sessions.length} most recent`}>
                {sessions.length === 0 ? (
                    <div className="empty-note">No sessions kept for this visitor.</div>
                ) : (
                    <div style={{ overflowX: 'auto', marginTop: 6 }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: 20 }}>Started</th>
                                    <th>Came from</th>
                                    <th>Device</th>
                                    <th className="num">Pages</th>
                                    <th style={{ paddingRight: 20 }} aria-label="Recording" />
                                </tr>
                            </thead>
                            <tbody>
                                {sessions.map(session => (
                                    <tr key={session.id}>
                                        <td style={{ paddingLeft: 20, whiteSpace: 'nowrap' }}>{dateTime(session.startedAt)}</td>
                                        <td className="muted">{session.source || 'Direct'}</td>
                                        <td className="muted">{session.device || '–'}</td>
                                        <td className="num">{session.pageviews}</td>
                                        <td style={{ paddingRight: 20, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            {session.recordingId && !app && (
                                                <Link href={`/dashboard/sessions?recording=${session.recordingId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8125rem' }}>
                                                    <Video size={14} aria-hidden="true" /> Watch
                                                </Link>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </ChartCard>

            <ChartCard flush title="Timeline" subtitle="Pages, forms, errors, feedback and events, newest first.">
                {timeline.length === 0 ? (
                    <div className="empty-note">Nothing recorded yet.</div>
                ) : (
                    <ol style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
                        {timeline.map((item, index) => {
                            const style = TIMELINE_ICON[item.type] ?? TIMELINE_ICON.event;
                            const Icon = style.icon;
                            const newSession = index > 0 && timeline[index - 1].sessionId !== item.sessionId;
                            return (
                                <li key={index} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 20px',
                                    borderTop: newSession ? '1px dashed var(--color-border)' : undefined,
                                }}>
                                    <Icon size={14} aria-hidden="true" style={{ color: style.color, marginTop: 3, flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0, fontSize: '0.8125rem' }}>
                                        <span style={{ color: 'var(--color-text-secondary)' }}>{style.label} </span>
                                        <span style={{ fontWeight: 500, wordBreak: 'break-word' }}>
                                            {item.type === 'pageview' ? path(item.label) : item.label}
                                        </span>
                                        {item.type !== 'pageview' && item.url && (
                                            <span style={{ color: 'var(--color-text-muted)' }}> on {path(item.url)}</span>
                                        )}
                                    </div>
                                    <time dateTime={item.at} style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                                        {dateTime(item.at)}
                                    </time>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </ChartCard>
        </div>
    );
}
