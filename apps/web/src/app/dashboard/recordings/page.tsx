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
import { domains } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Recording {
    id: string;
    visitorId: string;
    sessionId: string;
    startedAt: string;
    endedAt: string | null;
    duration: number;
    pagePath: string;
    screenWidth: number;
    screenHeight: number;
    eventCount: number;
    status: 'recording' | 'completed' | 'processing';
}

interface RecordingEvent {
    type: string;
    timestamp: number;
    data: Record<string, any>;
}

interface FullRecording extends Recording {
    events: RecordingEvent[];
}

async function getRecordings(domainId: string) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_URL}/api/recordings/${domainId}?status=completed`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
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

function getDeviceIcon(width: number) {
    if (width < 768) return Smartphone;
    if (width < 1024) return Tablet;
    return Monitor;
}

export default function RecordingsPage() {
    const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
    const [recordingsList, setRecordingsList] = useState<Recording[]>([]);
    const [selectedRecording, setSelectedRecording] = useState<FullRecording | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingPlayback, setLoadingPlayback] = useState(false);

    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackTime, setPlaybackTime] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
    const playbackRef = useRef<number>();

    useEffect(() => {
        domains.list().then(result => {
            if (result.data && result.data.domains.length > 0) {
                setSelectedDomainId(result.data.domains[0].id);
            } else {
                setLoading(false);
            }
        });
    }, []);

    useEffect(() => {
        if (!selectedDomainId) return;

        setLoading(true);
        getRecordings(selectedDomainId).then(data => {
            setRecordingsList(data.recordings || []);
            setLoading(false);
        });
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
                            x: (event.data.x / selectedRecording.screenWidth) * 100,
                            y: (event.data.y / selectedRecording.screenHeight) * 100
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

    const handleDelete = async (recordingId: string) => {
        if (!selectedDomainId || !confirm('Delete this recording?')) return;

        await deleteRecording(selectedDomainId, recordingId);
        setRecordingsList(prev => prev.filter(r => r.id !== recordingId));
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

    if (loading) {
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
                <h1>Session Recordings</h1>
                <div className="flex items-center gap-sm">
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        {recordingsList.length} recordings
                    </span>
                </div>
            </div>

            {recordingsList.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
                    <Video size={48} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }} />
                    <h3 style={{ marginBottom: 'var(--space-sm)' }}>No recordings yet</h3>
                    <p>Session recordings will appear here once visitors interact with your site</p>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-lg">
                    {/* Recording List */}
                    <div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                            {recordingsList.map(recording => {
                                const DeviceIcon = getDeviceIcon(recording.screenWidth);

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
                                                    {recording.pagePath}
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
                                                {recording.eventCount} events
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
                                    <h4 className="card-title">{selectedRecording.pagePath}</h4>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                        {selectedRecording.screenWidth}x{selectedRecording.screenHeight}
                                    </span>
                                </div>

                                {/* Player Screen */}
                                <div style={{
                                    position: 'relative',
                                    width: '100%',
                                    aspectRatio: `${selectedRecording.screenWidth}/${selectedRecording.screenHeight}`,
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
                                        [Session Playback - {selectedRecording.pagePath}]
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
