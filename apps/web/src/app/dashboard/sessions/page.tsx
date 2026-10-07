'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Video,
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Maximize2,
    Monitor,
    Smartphone,
    Tablet,
    Clock,
    MousePointer2,
    Trash2
} from 'lucide-react';
import { recordings, type RecordingDevice, type RecordingDuration } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

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

interface RecordingEvent {
    type: string;
    timestamp: number;
    data: Record<string, any>;
}

interface FullRecording extends Recording {
    events: RecordingEvent[];
}

const FALLBACK_VIEWPORT = { width: 1280, height: 720 };

/**
 * The recording row carries no viewport size, but the tracker stores it on the
 * recording's own first `pageview` event (and on every `resize`), and mouse
 * coordinates are clientX/clientY - i.e. relative to the viewport. So the replay
 * canvas is derived from those events rather than assumed.
 *
 * A session that is resized mid-recording is replayed against its initial
 * viewport; positions after the resize are therefore approximate.
 */
function viewportOf(events: RecordingEvent[]): { width: number; height: number } {
    for (const event of events) {
        const width = Number(event.data?.viewportWidth);
        const height = Number(event.data?.viewportHeight);
        if (width > 0 && height > 0) {
            return { width, height };
        }
    }
    return FALLBACK_VIEWPORT;
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

    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackTime, setPlaybackTime] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
    const playbackRef = useRef<number>();

    // Derived from the loaded recording's events; see viewportOf().
    const viewport = selectedRecording
        ? viewportOf(selectedRecording.events)
        : FALLBACK_VIEWPORT;

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
        setIsPlaying(false);
    }, [selectedDomainId]);

    // Playback loop
    useEffect(() => {
        if (!isPlaying || !selectedRecording) return;

        const interval = setInterval(() => {
            setPlaybackTime(prev => {
                const newTime = prev + (16 * playbackSpeed); // ~60fps

                if (newTime >= selectedRecording.duration * 1000) {
                    setIsPlaying(false);
                    return selectedRecording.duration * 1000;
                }

                // Find events at current time and update cursor
                const currentEvents = selectedRecording.events.filter(
                    e => e.timestamp >= prev && e.timestamp < newTime
                );

                for (const event of currentEvents) {
                    if (event.type === 'mousemove' && event.data) {
                        setCursorPosition({
                            x: (event.data.x / viewport.width) * 100,
                            y: (event.data.y / viewport.height) * 100
                        });
                    }
                }

                return newTime;
            });
        }, 16);

        playbackRef.current = interval as any;

        return () => clearInterval(interval);
    }, [isPlaying, selectedRecording, playbackSpeed]);

    const handleSelectRecording = async (recordingId: string) => {
        if (!selectedDomainId) return;

        setLoadingPlayback(true);
        const data = await getRecording(selectedDomainId, recordingId);
        setSelectedRecording(data);
        setPlaybackTime(0);
        setIsPlaying(false);
        setCursorPosition({ x: 50, y: 50 });
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

    const togglePlayback = () => setIsPlaying(!isPlaying);

    const skipTime = (seconds: number) => {
        if (!selectedRecording) return;
        setPlaybackTime(prev =>
            Math.max(0, Math.min(prev + seconds * 1000, selectedRecording.duration * 1000))
        );
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
                                                {formatDuration(recording.duration)}
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
                                {/* Player Header */}
                                <div className="card-header" style={{ marginBottom: 'var(--space-md)' }}>
                                    <h4 className="card-title">{selectedRecording.url}</h4>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                        {viewport.width}x{viewport.height}
                                    </span>
                                </div>

                                {/* Player Screen */}
                                <div style={{
                                    position: 'relative',
                                    width: '100%',
                                    aspectRatio: `${viewport.width}/${viewport.height}`,
                                    maxHeight: '400px',
                                    background: 'var(--color-bg-primary)',
                                    borderRadius: 'var(--radius-md)',
                                    overflow: 'hidden',
                                    margin: '0 auto'
                                }}>
                                    {/* Simulated page content */}
                                    <div style={{
                                        position: 'absolute',
                                        inset: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--color-text-muted)',
                                        fontSize: '0.875rem'
                                    }}>
                                        [Session Playback - {selectedRecording.url}]
                                    </div>

                                    {/* Cursor */}
                                    <div style={{
                                        position: 'absolute',
                                        left: `${cursorPosition.x}%`,
                                        top: `${cursorPosition.y}%`,
                                        transform: 'translate(-50%, -50%)',
                                        width: '20px',
                                        height: '20px',
                                        pointerEvents: 'none',
                                        transition: isPlaying ? 'left 16ms linear, top 16ms linear' : 'none'
                                    }}>
                                        <MousePointer2
                                            size={20}
                                            style={{
                                                color: 'var(--color-accent-primary)',
                                                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div style={{ marginTop: 'var(--space-lg)' }}>
                                    <div
                                        style={{
                                            height: '6px',
                                            background: 'var(--color-bg-secondary)',
                                            borderRadius: 'var(--radius-full)',
                                            cursor: 'pointer',
                                            overflow: 'hidden'
                                        }}
                                        onClick={(e) => {
                                            if (!selectedRecording) return;
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const percent = (e.clientX - rect.left) / rect.width;
                                            setPlaybackTime(percent * selectedRecording.duration * 1000);
                                        }}
                                    >
                                        <div style={{
                                            height: '100%',
                                            width: `${(playbackTime / (selectedRecording.duration * 1000)) * 100}%`,
                                            background: 'var(--color-accent-primary)',
                                            borderRadius: 'var(--radius-full)',
                                            transition: 'width 16ms linear'
                                        }} />
                                    </div>
                                </div>

                                {/* Controls */}
                                <div className="flex items-center justify-between" style={{ marginTop: 'var(--space-md)' }}>
                                    <div className="flex items-center gap-md">
                                        <button
                                            onClick={() => skipTime(-10)}
                                            className="btn btn-ghost"
                                            style={{ padding: 'var(--space-sm)' }}
                                        >
                                            <SkipBack size={18} />
                                        </button>
                                        <button
                                            onClick={togglePlayback}
                                            className="btn btn-primary"
                                            style={{
                                                width: '48px',
                                                height: '48px',
                                                borderRadius: 'var(--radius-full)',
                                                padding: 0,
                                                justifyContent: 'center'
                                            }}
                                        >
                                            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                                        </button>
                                        <button
                                            onClick={() => skipTime(10)}
                                            className="btn btn-ghost"
                                            style={{ padding: 'var(--space-sm)' }}
                                        >
                                            <SkipForward size={18} />
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-md">
                                        <span style={{ fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>
                                            {formatDuration(playbackTime / 1000)} / {formatDuration(selectedRecording.duration)}
                                        </span>

                                        {/* Speed selector */}
                                        <select
                                            value={playbackSpeed}
                                            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                                            className="input"
                                            style={{ width: 'auto', padding: 'var(--space-xs) var(--space-sm)' }}
                                        >
                                            <option value="0.5">0.5x</option>
                                            <option value="1">1x</option>
                                            <option value="2">2x</option>
                                            <option value="4">4x</option>
                                        </select>
                                    </div>
                                </div>
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
