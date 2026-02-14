'use client';

import { useState, useEffect } from 'react';
import {
    FileText,
    ArrowUpRight,
    ArrowDownRight,
    Clock,
    MousePointer,
    Eye,
    LogIn,
    LogOut,
    Search
} from 'lucide-react';
import { analytics } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

export default function PagesPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [pages, setPages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('pageviews');

    useEffect(() => {
        const loadPages = async () => {
            if (!selectedDomainId) return;
            setLoading(true);
            const result = await analytics.getTopPages(selectedDomainId);
            if (result.data) {
                setPages(result.data.pages || []);
            }
            setLoading(false);
        };

        if (selectedDomainId) {
            loadPages();
        }
    }, [selectedDomainId]);


    const filteredPages = pages
        .filter(p => p.path?.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

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
                <p>Please select a domain to view page analytics</p>
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
                    Pages
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Analyze performance of individual pages
                </p>
            </div>

            {/* Controls */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-lg)'
            }}>
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
                        placeholder="Search pages..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            fontSize: '0.8125rem',
                            color: 'var(--color-text-primary)',
                            width: '200px'
                        }}
                    />
                </div>
            </div>

            {/* Pages Table */}
            <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                overflow: 'hidden'
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                        <tr style={{ background: 'var(--color-bg-tertiary)' }}>
                            <th style={{
                                textAlign: 'left',
                                padding: 'var(--space-md)',
                                fontWeight: 500,
                                color: 'var(--color-text-secondary)'
                            }}>Page</th>
                            <th style={{
                                textAlign: 'right',
                                padding: 'var(--space-md)',
                                fontWeight: 500,
                                color: 'var(--color-text-secondary)',
                                cursor: 'pointer'
                            }} onClick={() => setSortBy('pageviews')}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                    <Eye size={12} /> Views {sortBy === 'pageviews' && '↓'}
                                </div>
                            </th>
                            <th style={{
                                textAlign: 'right',
                                padding: 'var(--space-md)',
                                fontWeight: 500,
                                color: 'var(--color-text-secondary)',
                                cursor: 'pointer'
                            }} onClick={() => setSortBy('avgTime')}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                    <Clock size={12} /> Avg Time {sortBy === 'avgTime' && '↓'}
                                </div>
                            </th>
                            <th style={{
                                textAlign: 'right',
                                padding: 'var(--space-md)',
                                fontWeight: 500,
                                color: 'var(--color-text-secondary)',
                                cursor: 'pointer'
                            }} onClick={() => setSortBy('entries')}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                    <LogIn size={12} /> Entries {sortBy === 'entries' && '↓'}
                                </div>
                            </th>
                            <th style={{
                                textAlign: 'right',
                                padding: 'var(--space-md)',
                                fontWeight: 500,
                                color: 'var(--color-text-secondary)',
                                cursor: 'pointer'
                            }} onClick={() => setSortBy('exits')}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                    <LogOut size={12} /> Exits {sortBy === 'exits' && '↓'}
                                </div>
                            </th>
                            <th style={{
                                textAlign: 'right',
                                padding: 'var(--space-md)',
                                fontWeight: 500,
                                color: 'var(--color-text-secondary)'
                            }}>Bounce</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredPages.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{
                                    padding: 'var(--space-xl)',
                                    textAlign: 'center',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    No pages found
                                </td>
                            </tr>
                        ) : (
                            filteredPages.map((page, idx) => (
                                <tr
                                    key={idx}
                                    style={{
                                        borderTop: '1px solid var(--color-border)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <td style={{ padding: 'var(--space-md)', color: 'var(--color-text-primary)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                                            <FileText size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                                            <span style={{
                                                maxWidth: '300px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {page.path || '/'}
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{
                                        textAlign: 'right',
                                        padding: 'var(--space-md)',
                                        color: 'var(--color-text-primary)',
                                        fontWeight: 500
                                    }}>
                                        {(page.pageviews || 0).toLocaleString()}
                                    </td>
                                    <td style={{
                                        textAlign: 'right',
                                        padding: 'var(--space-md)',
                                        color: 'var(--color-text-primary)'
                                    }}>
                                        {formatTime(page.avgTime || 0)}
                                    </td>
                                    <td style={{
                                        textAlign: 'right',
                                        padding: 'var(--space-md)',
                                        color: 'var(--color-text-primary)'
                                    }}>
                                        {(page.entries || 0).toLocaleString()}
                                    </td>
                                    <td style={{
                                        textAlign: 'right',
                                        padding: 'var(--space-md)',
                                        color: 'var(--color-text-primary)'
                                    }}>
                                        {(page.exits || 0).toLocaleString()}
                                    </td>
                                    <td style={{
                                        textAlign: 'right',
                                        padding: 'var(--space-md)',
                                        color: (page.bounceRate || 0) > 60 ? 'var(--color-warning)' : 'var(--color-text-primary)'
                                    }}>
                                        {(page.bounceRate || 0).toFixed(1)}%
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function formatTime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
}
