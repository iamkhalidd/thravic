'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
    Video,
    Monitor,
    Smartphone,
    Tablet,
    Clock,
    MousePointer2,
    Trash2
} from 'lucide-react';
import { recordings, type RecordingDevice, type RecordingDuration } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
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

export default function SessionsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [recordingsList, setRecordingsList] = useState<Recording[]>([]);
    const [total, setTotal] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [loadingMore, setLoadingMore] = useState(false);
    const [deviceFilter, setDeviceFilter] = useState<RecordingDevice | ''>('');
    const [durationFilter, setDurationFilter] = useState<RecordingDuration | ''>('');
    const [selectedRecording, setSelectedRecording] = useState<FullRecording | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingPlayback, setLoadingPlayback] = useState(false);

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }

        setLoading(true);
        recordings.list(selectedDomainId, {
            device: deviceFilter || undefined,
            duration: durationFilter || undefined,
        }).then(({ data }) => {
            setRecordingsList(data?.recordings || []);
            setTotal(data?.pagination.total ?? 0);
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
            <div>
                <div className="skeleton" style={{ height: '40px', width: '200px', marginBottom: 'var(--space-xl)' }} />
                <div className="grid grid-cols-3 gap-lg">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="card">
                            <div className="skeleton" style={{ height: '120px' }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-xl)' }}>
                <h1>Sessions</h1>
                <div className="flex items-center gap-sm">
                    <select
                        aria-label="Filter by device"
                        value={deviceFilter}
                        onChange={(e) => setDeviceFilter(e.target.value as RecordingDevice | '')}
                        className="input"
                        style={{ width: 'auto', padding: 'var(--space-xs) var(--space-sm)' }}
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
                        style={{ width: 'auto', padding: 'var(--space-xs) var(--space-sm)' }}
                    >
                        {DURATION_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        {(total ?? 0).toLocaleString()} {total === 1 ? 'session' : 'sessions'}
                    </span>
                </div>
            </div>

            {recordingsList.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)', opacity: loading ? 0.6 : 1 }}>
                    <Video size={48} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }} />
                    {deviceFilter || durationFilter ? (
                        <>
                            <h3 style={{ marginBottom: 'var(--space-sm)' }}>No matching recordings</h3>
                            <p>Try a different device or length filter</p>
                        </>
                    ) : (
                        <>
                            <h3 style={{ marginBottom: 'var(--space-sm)' }}>No recordings yet</h3>
                            <p>Session recordings will appear here once visitors interact with your site</p>
                        </>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-lg">
                    {/* Recording List */}
                    <div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', opacity: loading ? 0.6 : 1 }}>
                            {recordingsList.map(recording => {
                                const DeviceIcon = DEVICE_ICONS[recording.device ?? 'unknown'];

                                return (
                                    <div
                                        key={recording.id}
                                        className="card"
                                        onClick={() => handleSelectRecording(recording.id)}
                                        style={{
                                            cursor: 'pointer',
                                            borderColor: selectedRecording?.id === recording.id
                                                ? 'var(--color-accent-primary)'
                                                : undefined
                                        }}
                                    >
                                        <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-sm)' }}>
                                            <div className="flex items-center gap-sm">
                                                <DeviceIcon size={16} style={{ color: 'var(--color-text-muted)' }} />
                                                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                                                    {recording.url}
                                                </span>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(recording.id);
                                                }}
                                                className="btn btn-ghost"
                                                style={{ padding: 'var(--space-xs)' }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-md" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                            <span className="flex items-center gap-xs">
                                                <Clock size={12} />
                                                {formatDuration(recording.duration ?? 0)}
                                            </span>
                                            <span className="flex items-center gap-xs">
                                                <MousePointer2 size={12} />
                                                {recording.eventsCount} events
                                            </span>
                                        </div>

                                        <div style={{
                                            marginTop: 'var(--space-sm)',
                                            fontSize: '0.75rem',
                                            color: 'var(--color-text-muted)'
                                        }}>
                                            {new Date(recording.startedAt).toLocaleString()}
                                        </div>
                                    </div>
                                );
                            })}
                            {total !== null && recordingsList.length < total && (
                                <button
                                    className="btn btn-secondary"
                                    onClick={handleLoadMore}
                                    disabled={loadingMore}
                                >
                                    {loadingMore ? 'Loading...' : `Load more (${(total - recordingsList.length).toLocaleString()} left)`}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Playback Player */}
                    <div style={{ gridColumn: 'span 2' }}>
                        {loadingPlayback ? (
                            <div className="card" style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: '500px'
                            }}>
                                <div className="skeleton" style={{ width: '100%', height: '400px' }} />
                            </div>
                        ) : selectedRecording ? (
                            <div className="card">
                                <div className="card-header" style={{ marginBottom: 'var(--space-md)' }}>
                                    <h4 className="card-title">{selectedRecording.url}</h4>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                        {formatDuration(selectedRecording.duration ?? 0)}
                                    </span>
                                </div>
                                {selectedRecording.format === 'rrweb' && selectedRecording.events.length > 1 ? (
                                    <ScreenReplay events={selectedRecording.events} />
                                ) : (
                                    <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                        <Video size={40} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                                        <p>
                                            {selectedRecording.format === 'rrweb'
                                                ? 'Nothing to replay yet — the visitor’s page has not been captured.'
                                                : 'This session was recorded before screen replay, so there is no screen to show.'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="card" style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: '500px',
                                color: 'var(--color-text-muted)'
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <Video size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                                    <p>Select a recording to play</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
