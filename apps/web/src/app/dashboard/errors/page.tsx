'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Hash, Search } from 'lucide-react';
import { customEvents } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';

type ErrorRow = {
    message: string;
    source: string | null;
    count: number;
    first_seen: string;
    last_seen: string;
};

/** "http://site/js/app.js?v=2" -> "app.js"; the full source stays in the tooltip. */
function fileOf(source: string | null): string {
    if (!source) return '—';
    return source.split('?')[0].split('/').pop() || source;
}

export default function ErrorsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const range = useApiRange();
    const [data, setData] = useState<{ totalErrors: number; errors: ErrorRow[] } | null>(null);
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
            if (!range.background) setLoading(true);
            const result = await customEvents.getErrors(selectedDomainId, range.start, range.end);
            if (cancelled) return;
            setData(result.data ?? null);
            setLoadError(result.data ? null : result.error || 'Could not load errors');
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [selectedDomainId, range, domainLoading]);

    const header = (
        <PageHeader title="Errors" subtitle="JavaScript errors and crashes captured on your site" />
    );

    if (!selectedDomainId && !domainLoading) {
        return (
            <div className="page-stack">
                {header}
                <div className="card empty-note">Select a website to see its errors.</div>
            </div>
        );
    }

    const busy = loading || domainLoading;
    const errors = data?.errors ?? [];
    const query = searchQuery.trim().toLowerCase();
    const filtered = errors.filter(e =>
        (e.message || '').toLowerCase().includes(query) ||
        (e.source || '').toLowerCase().includes(query)
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
                <StatCard label="Total errors" icon={AlertTriangle} loading={busy}
                    value={(data?.totalErrors ?? 0).toLocaleString()} />
                <StatCard label="Unique errors" icon={Hash} loading={busy}
                    value={errors.length.toLocaleString()} hint="Grouped by message and source" />
            </div>

            <ChartCard
                title="Error log"
                subtitle="Most frequent first"
                flush
                loading={busy}
                action={
                    <label style={{ position: 'relative', flex: '0 1 240px', minWidth: 140 }}>
                        <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="search"
                            className="input"
                            aria-label="Search errors"
                            placeholder="Search errors…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ padding: '6px 10px 6px 30px', fontSize: '0.8125rem' }}
                        />
                    </label>
                }
            >
                {loadError ? (
                    <p className="empty-note">Errors could not be loaded.</p>
                ) : filtered.length === 0 ? (
                    <p className="empty-note">
                        {errors.length === 0 ? 'No errors in this period.' : 'No errors match your search.'}
                    </p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: 20 }}>Message</th>
                                    <th>Source</th>
                                    <th className="num">Count</th>
                                    <th className="num" style={{ paddingRight: 20 }}>Last seen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((err, idx) => (
                                    <tr key={idx}>
                                        <td style={{ paddingLeft: 20, maxWidth: 480 }}>
                                            <div title={err.message} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {err.message || 'Unknown error'}
                                            </div>
                                        </td>
                                        <td className="muted" style={{ maxWidth: 220 }}>
                                            <div title={err.source || undefined} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                                                {fileOf(err.source)}
                                            </div>
                                        </td>
                                        <td className="num" style={{ fontWeight: 500 }}>{Number(err.count).toLocaleString()}</td>
                                        <td className="num muted" style={{ paddingRight: 20 }}>
                                            {new Date(err.last_seen).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </ChartCard>
        </div>
    );
}
