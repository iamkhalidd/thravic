'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, FileCode, Hash, Search } from 'lucide-react';
import { customEvents } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

export default function ErrorsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!selectedDomainId) return;
            setLoading(true);
            const result = await customEvents.getErrors(selectedDomainId);
            if (result.data) setData(result.data);
            setLoading(false);
        };
        if (selectedDomainId) load();
    }, [selectedDomainId]);

    if (!selectedDomainId && !domainLoading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
                <p>Please select a domain to view error tracking</p>
            </div>
        );
    }

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
                <p>Please select a domain to view error tracking</p>
            </div>
        );
    }

    const errors = data?.errors || [];
    const filtered = errors.filter((e: any) =>
        e.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.source?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 'var(--space-xl)' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-xs)' }}>
                    Error Tracking
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    JavaScript errors and crashes captured from your website
                </p>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
                <div style={{
                    background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)', padding: 'var(--space-lg)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
                        <AlertTriangle size={16} style={{ color: '#ef4444' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Errors</span>
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {(data?.totalErrors || 0).toLocaleString()}
                    </div>
                </div>
                <div style={{
                    background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)', padding: 'var(--space-lg)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
                        <Hash size={16} style={{ color: 'var(--color-accent-primary)' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unique Errors</span>
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {errors.length}
                    </div>
                </div>
            </div>

            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', padding: 'var(--space-xs) var(--space-sm)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: 'var(--space-lg)', maxWidth: '400px' }}>
                <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                <input
                    type="text"
                    placeholder="Search errors..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.8125rem', color: 'var(--color-text-primary)', width: '100%' }}
                />
            </div>

            {/* Table */}
            <div className="dash-table-wrap" style={{ background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                        <tr style={{ background: 'var(--color-bg-tertiary)' }}>
                            <th style={{ textAlign: 'left', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Error Message</th>
                            <th style={{ textAlign: 'left', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Source</th>
                            <th style={{ textAlign: 'right', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Count</th>
                            <th style={{ textAlign: 'right', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Last Seen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={4} style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                    {errors.length === 0 ? '🎉 No errors detected — your site is clean!' : 'No errors match your search'}
                                </td>
                            </tr>
                        ) : filtered.map((err: any, idx: number) => (
                            <tr key={idx} style={{ borderTop: '1px solid var(--color-border)' }}>
                                <td style={{ padding: 'var(--space-md)', color: 'var(--color-text-primary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-xs)' }}>
                                        <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                                        <span style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {err.message || 'Unknown Error'}
                                        </span>
                                    </div>
                                </td>
                                <td style={{ padding: 'var(--space-md)', color: 'var(--color-text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <FileCode size={12} />
                                        {err.source ? err.source.split('/').pop() : '—'}
                                    </div>
                                </td>
                                <td style={{ textAlign: 'right', padding: 'var(--space-md)', fontWeight: 600, color: err.count > 10 ? '#ef4444' : 'var(--color-text-primary)' }}>
                                    {err.count.toLocaleString()}
                                </td>
                                <td style={{ textAlign: 'right', padding: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                        <Clock size={12} />
                                        {new Date(err.last_seen).toLocaleDateString()}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
