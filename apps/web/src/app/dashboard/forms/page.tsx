'use client';

import { useState, useEffect } from 'react';
import { FileInput, Hash, Send, Search } from 'lucide-react';
import { customEvents } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

export default function FormsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!selectedDomainId) return;
            setLoading(true);
            const result = await customEvents.getForms(selectedDomainId);
            if (result.data) setData(result.data);
            setLoading(false);
        };
        if (selectedDomainId) load();
    }, [selectedDomainId]);

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
                <p>Please select a domain to view form analytics</p>
            </div>
        );
    }

    const forms = data?.forms || [];
    const filtered = forms.filter((f: any) =>
        (f.form_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.form_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.action || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 'var(--space-xl)' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-xs)' }}>
                    Form Analytics
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Track form submissions across your website
                </p>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
                <div style={{
                    background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)', padding: 'var(--space-lg)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
                        <Send size={16} style={{ color: 'var(--color-accent-primary)' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Submissions</span>
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {(data?.totalSubmissions || 0).toLocaleString()}
                    </div>
                </div>
                <div style={{
                    background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)', padding: 'var(--space-lg)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
                        <Hash size={16} style={{ color: '#8b5cf6' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unique Forms</span>
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {forms.length}
                    </div>
                </div>
            </div>

            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', padding: 'var(--space-xs) var(--space-sm)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: 'var(--space-lg)', maxWidth: '400px' }}>
                <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                <input
                    type="text"
                    placeholder="Search forms..."
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
                            <th style={{ textAlign: 'left', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Form</th>
                            <th style={{ textAlign: 'left', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Action</th>
                            <th style={{ textAlign: 'center', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Method</th>
                            <th style={{ textAlign: 'right', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Fields</th>
                            <th style={{ textAlign: 'right', padding: 'var(--space-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Submissions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                    {forms.length === 0 ? (
                                        <div>
                                            <FileInput size={32} style={{ margin: '0 auto var(--space-sm)', display: 'block', opacity: 0.5 }} />
                                            <p style={{ fontWeight: 500 }}>No form submissions yet</p>
                                            <p style={{ fontSize: '0.8125rem', marginTop: 'var(--space-xs)' }}>
                                                Form submissions will appear here once visitors start using forms on your website.
                                            </p>
                                        </div>
                                    ) : 'No forms match your search'}
                                </td>
                            </tr>
                        ) : filtered.map((form: any, idx: number) => (
                            <tr key={idx} style={{ borderTop: '1px solid var(--color-border)' }}>
                                <td style={{ padding: 'var(--space-md)', color: 'var(--color-text-primary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                                        <FileInput size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{form.form_name || form.form_id || 'Unnamed Form'}</div>
                                            {form.form_id && form.form_name && (
                                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>#{form.form_id}</div>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: 'var(--space-md)', color: 'var(--color-text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {form.action || '—'}
                                </td>
                                <td style={{ textAlign: 'center', padding: 'var(--space-md)' }}>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: 600,
                                        background: form.method === 'POST' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                        color: form.method === 'POST' ? '#22c55e' : '#3b82f6',
                                    }}>
                                        {form.method || 'GET'}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'right', padding: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
                                    {form.avg_fields || 0}
                                </td>
                                <td style={{ textAlign: 'right', padding: 'var(--space-md)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                    {form.submissions.toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
