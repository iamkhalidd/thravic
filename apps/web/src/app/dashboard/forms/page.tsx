'use client';

import { useState, useEffect } from 'react';
import { Hash, Search, Send } from 'lucide-react';
import { customEvents } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';

type FormRow = {
    form_id: string | null;
    form_name: string | null;
    action: string | null;
    method: string | null;
    submissions: number;
    avg_fields: number;
    pages: number;
};

/** The tracker sometimes sends an empty object as the name ("{}"); treat it as missing. */
function cleanName(name: string | null): string | null {
    if (!name) return null;
    const trimmed = name.trim();
    return trimmed && trimmed !== '{}' && trimmed !== '[object Object]' ? trimmed : null;
}

export default function FormsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const range = useApiRange();
    const [data, setData] = useState<{ totalSubmissions: number; forms: FormRow[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            const result = await customEvents.getForms(selectedDomainId, range.start, range.end);
            if (cancelled) return;
            setData(result.data ?? null);
            setLoadError(result.data ? null : result.error || 'Could not load form submissions');
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [selectedDomainId, range, domainLoading]);

    const header = (
        <PageHeader title="Forms" subtitle="Form submissions across your site" />
    );

    if (!selectedDomainId && !domainLoading) {
        return (
            <div className="page-stack">
                {header}
                <div className="card empty-note">Select a website to see its forms.</div>
            </div>
        );
    }

    const busy = loading || domainLoading;
    const forms = data?.forms ?? [];
    const query = searchQuery.trim().toLowerCase();
    const filtered = forms.filter(f =>
        (cleanName(f.form_name) || '').toLowerCase().includes(query) ||
        (f.form_id || '').toLowerCase().includes(query) ||
        (f.action || '').toLowerCase().includes(query)
    );

    return (
        <div className="page-stack">
            {header}

            {loadError && !busy && (
                <div role="alert" className="card" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>
                    {loadError}
                </div>
            )}

            <div className="stat-grid">
                <StatCard label="Submissions" icon={Send} loading={busy}
                    value={(data?.totalSubmissions ?? 0).toLocaleString()} />
                <StatCard label="Forms" icon={Hash} loading={busy}
                    value={forms.length.toLocaleString()} hint="With at least one submission" />
            </div>

            <ChartCard
                title="All forms"
                subtitle="By submissions"
                flush
                loading={busy}
                action={
                    <label style={{ position: 'relative', flex: '0 1 240px', minWidth: 140 }}>
                        <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="search"
                            className="input"
                            aria-label="Search forms"
                            placeholder="Search forms…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ padding: '6px 10px 6px 30px', fontSize: '0.8125rem' }}
                        />
                    </label>
                }
            >
                {loadError ? (
                    <p className="empty-note">Form submissions could not be loaded.</p>
                ) : filtered.length === 0 ? (
                    <p className="empty-note">
                        {forms.length === 0
                            ? 'No form submissions in this period. They appear once visitors submit a form on your site.'
                            : 'No forms match your search.'}
                    </p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: 20 }}>Form</th>
                                    <th>Action</th>
                                    <th>Method</th>
                                    <th className="num">Fields</th>
                                    <th className="num" style={{ paddingRight: 20 }}>Submissions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((form, idx) => {
                                    const name = cleanName(form.form_name);
                                    return (
                                        <tr key={idx}>
                                            <td style={{ paddingLeft: 20 }}>
                                                <span style={{ fontWeight: 500 }}>{name || (form.form_id ? `#${form.form_id}` : 'Unnamed form')}</span>
                                                {name && form.form_id && (
                                                    <span className="muted" style={{ marginLeft: 6, fontSize: '0.75rem' }}>#{form.form_id}</span>
                                                )}
                                            </td>
                                            <td className="muted" style={{ maxWidth: 260 }}>
                                                <div title={form.action || undefined} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                                                    {form.action || '—'}
                                                </div>
                                            </td>
                                            <td><span className="badge">{(form.method || 'GET').toUpperCase()}</span></td>
                                            <td className="num muted">{Number(form.avg_fields || 0).toLocaleString()}</td>
                                            <td className="num" style={{ paddingRight: 20, fontWeight: 500 }}>
                                                {Number(form.submissions).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </ChartCard>
        </div>
    );
}
