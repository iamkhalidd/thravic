'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Monitor, Smartphone, Tablet, Trash2 } from 'lucide-react';
import { recordings, type RecordingDevice, type RecordingDuration } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useSubscription } from '@/hooks/useSubscription';
import RecordingControls from '@/components/RecordingControls';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import type { ReplayEvent } from '@/components/ScreenReplay';

// rrweb needs the browser; load the player only when a recording is opened.
const ScreenReplay = dynamic(() => import('@/components/ScreenReplay'), {
    ssr: false,
    loading: () => <div className="skeleton" style={{ width: '100%', height: '400px' }} />,
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Mirrors /api/recordings/{domainId}: url/duration/eventsCount and the session's
// device class. There is no visitor id, status or viewport size on a recording row.
interface Recording {
    id: string;
    url: string;
    startedAt: string;
    endedAt: string | null;
    duration: number;
    eventsCount: number;
    /** `rrweb`: a screen recording. `legacy`: cursor-only data from the old tracker. */
    format?: 'rrweb' | 'legacy';
    device?: RecordingDevice | 'unknown';
}

const DEVICE_ICONS = { desktop: Monitor, tablet: Tablet, mobile: Smartphone, unknown: Monitor };

const DEVICE_OPTIONS: Array<{ value: RecordingDevice | ''; label: string }> = [
    { value: '', label: 'All devices' },
    { value: 'desktop', label: 'Desktop' },
    { value: 'tablet', label: 'Tablet' },
    { value: 'mobile', label: 'Mobile' },
];

const DURATION_OPTIONS: Array<{ value: RecordingDuration | ''; label: string }> = [
    { value: '', label: 'Any length' },
    { value: 'short', label: 'Under 30s' },
    { value: 'medium', label: '30s – 3 min' },
    { value: 'long', label: 'Over 3 min' },
];

interface FullRecording extends Recording {
    events: ReplayEvent[];
}

async function getRecording(domainId: string, recordingId: string) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_URL}/api/recordings/${domainId}/${recordingId}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}

async function deleteRecording(domainId: string, recordingId: string) {
    const token = localStorage.getItem('accessToken');
    await fetch(`${API_URL}/api/recordings/${domainId}/${recordingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
}

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** The path (and query) of a recorded URL; the host is the same site on every row. */
function shortPath(url: string): string {
    try {
        const u = new URL(url);
        return `${u.pathname}${u.search}` || '/';
    } catch {
        return url;
    }
}

/** "just now", "12m ago", "3h ago", then "Mar 4" (with the year when it is not this year). */
function shortTime(date: Date): string {
    const seconds = (Date.now() - date.getTime()) / 1000;
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export default function SessionsPage() {
    const { selectedDomainId, selectedDomain, loading: domainLoading } = useDomain();
    const { hasFeature } = useSubscription();
    const [startedToday, setStartedToday] = useState<number | null>(null);
    const [recordingsList, setRecordingsList] = useState<Recording[]>([]);
    const [total, setTotal] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [loadingMore, setLoadingMore] = useState(false);
    const [deviceFilter, setDeviceFilter] = useState<RecordingDevice | ''>('');
    const [durationFilter, setDurationFilter] = useState<RecordingDuration | ''>('');
    const [selectedRecording, setSelectedRecording] = useState<FullRecording | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingPlayback, setLoadingPlayback] = useState(false);
    const [listError, setListError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }

        setLoading(true);
        recordings.list(selectedDomainId, {
            device: deviceFilter || undefined,
            duration: durationFilter || undefined,
        }).then(({ data, error }) => {
            setListError(data ? null : (error || 'Something went wrong'));
            setRecordingsList(data?.recordings || []);
            setTotal(data?.pagination.total ?? 0);
            setStartedToday(data?.startedToday ?? null);
            setPage(1);
            setLoading(false);
        });
    }, [selectedDomainId, domainLoading, deviceFilter, durationFilter]);

    // A recording from the previous domain must not stay open.
    useEffect(() => {
        setSelectedRecording(null);
    }, [selectedDomainId]);

    const handleSelectRecording = async (recordingId: string) => {
        if (!selectedDomainId) return;

        setLoadingPlayback(true);
        const data = await getRecording(selectedDomainId, recordingId);
        setSelectedRecording(data);
        setLoadingPlayback(false);
    };

    const handleLoadMore = async () => {
        if (!selectedDomainId) return;
        setLoadingMore(true);
        const { data } = await recordings.list(selectedDomainId, {
            device: deviceFilter || undefined,
            duration: durationFilter || undefined,
            page: page + 1,
        });
        if (data) {
            // Skip rows already shown: a recording that started since the first page
            // shifts the offsets by one.
            setRecordingsList(prev => [
                ...prev,
                ...data.recordings.filter(r => !prev.some(p => p.id === r.id)),
            ]);
            setTotal(data.pagination.total);
            setPage(page + 1);
        }
        setLoadingMore(false);
    };

    const handleDelete = async (recordingId: string) => {
        if (!selectedDomainId || !confirm('Delete this recording?')) return;

        await deleteRecording(selectedDomainId, recordingId);
        setRecordingsList(prev => prev.filter(r => r.id !== recordingId));
        setTotal(prev => (prev === null ? prev : Math.max(0, prev - 1)));
        if (selectedRecording?.id === recordingId) {
            setSelectedRecording(null);
        }
    };

    // Full skeleton only for the first load; filter changes keep the page in place.
    if (loading && total === null) {
        return (
            <div className="page-stack">
                <div className="skeleton" style={{ height: '28px', width: '180px' }} />
                <div className="card"><div className="skeleton" style={{ height: '72px' }} /></div>
                <div className="split-grid">
                    <div className="card"><div className="skeleton" style={{ height: '360px' }} /></div>
                    <div className="card"><div className="skeleton" style={{ height: '360px' }} /></div>
                </div>
            </div>
        );
    }

    const filtered = !!(deviceFilter || durationFilter);

    return (
        <div className="page-stack">
            <PageHeader
                title="Sessions"
                subtitle="Replay how visitors move through your site."
                actions={
                    <>
                        <select
                            aria-label="Filter by device"
                            value={deviceFilter}
                            onChange={(e) => setDeviceFilter(e.target.value as RecordingDevice | '')}
                            className="input"
                            style={{ width: 'auto', padding: '6px 10px', fontSize: '0.8125rem' }}
                        >
                            {DEVICE_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <select
                            aria-label="Filter by length"
                            value={durationFilter}
                            onChange={(e) => setDurationFilter(e.target.value as RecordingDuration | '')}
                            className="input"
                            style={{ width: 'auto', padding: '6px 10px', fontSize: '0.8125rem' }}
                        >
                            {DURATION_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </>
                }
            />

            {selectedDomainId && (
                <RecordingControls
                    domainId={selectedDomainId}
                    startedToday={startedToday}
                    locked={!hasFeature('recordings', selectedDomain?.features || undefined)}
                />
            )}

            {listError ? (
                <div className="card" role="alert" style={{ borderColor: 'var(--color-error)' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-error)', margin: 0 }}>
                        Could not load recordings: {listError}
                    </p>
                </div>
            ) : recordingsList.length === 0 ? (
                <ChartCard title="Recordings">
                    <div className="empty-note" style={{ opacity: loading ? 0.6 : 1 }}>
                        {filtered
                            ? 'No recordings match these filters. Try a different device or length.'
                            : 'No recordings yet. They appear here once visitors interact with your site.'}
                    </div>
                </ChartCard>
            ) : (
                <div className="split-grid" style={{ alignItems: 'start' }}>
                    {/* Player */}
                    {loadingPlayback ? (
                        <div className="card"><div className="skeleton" style={{ width: '100%', height: '400px' }} /></div>
                    ) : selectedRecording ? (
                        <ChartCard
                            title={<span title={selectedRecording.url}>{shortPath(selectedRecording.url)}</span>}
                            subtitle={`${new Date(selectedRecording.startedAt).toLocaleString()} · ${formatDuration(selectedRecording.duration ?? 0)} · ${(selectedRecording.eventsCount ?? 0).toLocaleString()} ${selectedRecording.eventsCount === 1 ? 'event' : 'events'}`}
                        >
                            {selectedRecording.format === 'rrweb' && selectedRecording.events.length > 1 ? (
                                <ScreenReplay events={selectedRecording.events} />
                            ) : (
                                <div className="empty-note">
                                    {selectedRecording.format === 'rrweb'
                                        ? 'Nothing to replay yet: the visitor’s page has not been captured.'
                                        : 'This session was recorded before screen replay, so there is no screen to show.'}
                                </div>
                            )}
                        </ChartCard>
                    ) : (
                        <ChartCard title="Player">
                            <div className="empty-note" style={{ padding: '96px 12px' }}>
                                Select a recording to play it here.
                            </div>
                        </ChartCard>
                    )}

                    {/* Recording list */}
                    <ChartCard
                        flush
                        title="Recordings"
                        subtitle={`${(total ?? 0).toLocaleString()} ${total === 1 ? 'session' : 'sessions'}${filtered ? ' matching filters' : ''}`}
                    >
                        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, opacity: loading ? 0.6 : 1, borderTop: '1px solid var(--color-border)' }}>
                            {recordingsList.map(recording => {
                                const device = recording.device ?? 'unknown';
                                const DeviceIcon = DEVICE_ICONS[device];
                                const active = selectedRecording?.id === recording.id;
                                const started = new Date(recording.startedAt);

                                return (
                                    <li
                                        key={recording.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            borderBottom: '1px solid var(--color-border)',
                                            background: active ? 'var(--color-bg-hover)' : undefined,
                                            boxShadow: active ? 'inset 2px 0 0 var(--color-accent-primary)' : undefined,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => handleSelectRecording(recording.id)}
                                            aria-current={active ? 'true' : undefined}
                                            title={recording.url}
                                            style={{
                                                flex: 1,
                                                minWidth: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                                padding: '8px 4px 8px 16px',
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                color: 'var(--color-text-primary)',
                                                fontSize: '0.8125rem',
                                            }}
                                        >
                                            <DeviceIcon size={14} aria-label={device === 'unknown' ? 'Unknown device' : device} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                                            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                                    {shortPath(recording.url)}
                                                </span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                                    {formatDuration(recording.duration ?? 0)} · {recording.eventsCount.toLocaleString()} {recording.eventsCount === 1 ? 'event' : 'events'}
                                                </span>
                                            </span>
                                            <time
                                                dateTime={recording.startedAt}
                                                title={started.toLocaleString()}
                                                style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                                            >
                                                {shortTime(started)}
                                            </time>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(recording.id)}
                                            className="btn btn-ghost"
                                            aria-label="Delete recording"
                                            title="Delete recording"
                                            style={{ padding: 6, marginRight: 10, color: 'var(--color-text-secondary)' }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        {total !== null && recordingsList.length < total && (
                            <div style={{ padding: 12 }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={handleLoadMore}
                                    disabled={loadingMore}
                                    style={{ width: '100%', justifyContent: 'center' }}
                                >
                                    {loadingMore ? 'Loading…' : `Load more (${(total - recordingsList.length).toLocaleString()} left)`}
                                </button>
                            </div>
                        )}
                    </ChartCard>
                </div>
            )}
        </div>
    );
}
