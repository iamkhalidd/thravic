'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Video,
    Play,
    Clock,
    Filter,
    Search,
    ArrowRight
} from 'lucide-react';
import { recordings } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

// Mirrors the `recordings` entries returned by /api/recordings/{domainId}.
interface SessionRecording {
    id: string;
    url: string;
    duration: number;
    eventsCount: number;
    startedAt: string;
    endedAt: string | null;
}

export default function SessionsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [sessions, setSessions] = useState<SessionRecording[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({
        duration: 'all'
    });

    useEffect(() => {
        const loadSessions = async () => {
            if (!selectedDomainId) return;
            setLoading(true);
            const result = await recordings.list(selectedDomainId);
            if (result.data) {
                setSessions(result.data.recordings || []);
            }
            setLoading(false);
        };

        if (selectedDomainId) {
            loadSessions();
        }
    }, [selectedDomainId]);

    // The API returns url/duration/eventsCount - there is no visitor id, device
    // or country on a recording, so only the fields that exist are filtered on.
    const filteredSessions = sessions.filter(session => {
        if (searchQuery && !(session.url || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
        if (filters.duration === 'short' && session.duration > 60) return false;
        if (filters.duration === 'medium' && (session.duration < 60 || session.duration > 300)) return false;
        if (filters.duration === 'long' && session.duration < 300) return false;
        return true;
    });

    if (domainLoading || loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-xl)' }}>
                <div className="loading-spinner" />
            </div>
        );
    }

    if (!selectedDomainId) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
                <p>Please select a domain to view session recordings</p>
            </div>
        );
    }

    return (
        <div>
            {/* Page Header */}
            <div style={{ marginBottom: 'var(--space-xl)' }}>
                <h1 style={{
                    fontSize: '1.5rem',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: 'var(--space-xs)'
                }}>
                    Session Recordings
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Watch real user sessions to understand behavior
                </p>
            </div>

            {/* Filters */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-md)',
                marginBottom: 'var(--space-lg)',
                padding: 'var(--space-md)',
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)'
            }}>
                {/* Search */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-xs)',
                    padding: 'var(--space-xs) var(--space-sm)',
                    background: 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)'
                }}>
                    <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    <input
                        type="text"
                        placeholder="Search by page URL..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            fontSize: '0.8125rem',
                            color: 'var(--color-text-primary)',
                            width: '180px'
                        }}
                    />
                </div>

                {/* Duration Filter */}
                <select
                    value={filters.duration}
                    onChange={(e) => setFilters({ ...filters, duration: e.target.value })}
                    style={{
                        padding: 'var(--space-xs) var(--space-sm)',
                        background: 'var(--color-bg-tertiary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.8125rem',
                        color: 'var(--color-text-primary)',
                        cursor: 'pointer'
                    }}
                >
                    <option value="all">Any Duration</option>
                    <option value="short">&lt; 1 min</option>
                    <option value="medium">1-5 min</option>
                    <option value="long">&gt; 5 min</option>
                </select>

                <div style={{
                    marginLeft: 'auto',
                    fontSize: '0.8125rem',
                    color: 'var(--color-text-secondary)'
                }}>
                    {filteredSessions.length} sessions
                </div>
            </div>

            {/* Sessions List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {filteredSessions.length === 0 ? (
                    <div style={{
                        padding: 'var(--space-xl)',
                        textAlign: 'center',
                        color: 'var(--color-text-secondary)',
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-border)'
                    }}>
                        <Video size={40} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                        <p>No session recordings found</p>
                        <p style={{ fontSize: '0.8125rem', marginTop: 'var(--space-xs)' }}>
                            Session recordings will appear here once visitors interact with your site
                        </p>
                    </div>
                ) : (
                    filteredSessions.map((session, idx) => (
                        <Link
                            key={idx}
                            href="/dashboard/recordings"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-md)',
                                padding: 'var(--space-md)',
                                background: 'var(--color-bg-secondary)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--color-border)',
                                textDecoration: 'none',
                                transition: 'all var(--transition-fast)'
                            }}
                        >
                            {/* Play Button */}
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--color-primary-alpha)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Play size={20} style={{ color: 'var(--color-primary)' }} />
                            </div>

                            {/* Session Info */}
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-sm)',
                                    marginBottom: '4px'
                                }}>
                                    <span style={{
                                        fontSize: '0.875rem',
                                        fontWeight: 500,
                                        color: 'var(--color-text-primary)'
                                    }}>
                                        {session.url || 'Unknown page'}
                                    </span>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-md)',
                                    fontSize: '0.75rem',
                                    color: 'var(--color-text-tertiary)'
                                }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={12} />
                                        {formatDuration(session.duration || 0)}
                                    </span>
                                    <span>
                                        {session.eventsCount || 0} events
                                    </span>
                                </div>
                            </div>

                            {/* Timestamp */}
                            <div style={{ textAlign: 'right' }}>
                                <div style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    {new Date(session.startedAt).toLocaleDateString()}
                                </div>
                                <div style={{
                                    fontSize: '0.6875rem',
                                    color: 'var(--color-text-tertiary)'
                                }}>
                                    {new Date(session.startedAt).toLocaleTimeString()}
                                </div>
                            </div>

                            <ArrowRight size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
}
