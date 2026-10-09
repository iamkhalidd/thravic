'use client';

import { useState, useEffect } from 'react';
import { Search, AlertTriangle } from 'lucide-react';
import { analytics } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { duration } from '@/components/charts/format';

interface PageRow {
    path: string;
    pageviews: number;
    avgTime: number;
    entries: number;
    exits: number;
    bounceRate: number;
}

type SortKey = 'pageviews' | 'avgTime' | 'entries' | 'exits' | 'bounceRate';

const COLUMNS: Array<{ key: SortKey; label: string }> = [
    { key: 'pageviews', label: 'Views' },
    { key: 'avgTime', label: 'Avg. time' },
    { key: 'entries', label: 'Entries' },
    { key: 'exits', label: 'Exits' },
    { key: 'bounceRate', label: 'Bounce' },
];

/** Bounce rates above this are flagged. */
const HIGH_BOUNCE = 60;

export default function PagesPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const range = useApiRange();
    const [pages, setPages] = useState<PageRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortKey>('pageviews');

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }
        let cancelled = false;
        if (!range.background) setLoading(true);
        analytics.getTopPages(selectedDomainId, range.start, range.end).then(result => {
            if (cancelled) return;
            setError(result.error ?? null);
            setPages(result.data?.pages ?? []);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [selectedDomainId, range, domainLoading]);

    const query = searchQuery.toLowerCase();
    const filteredPages = pages
        .filter(p => (p.path || '/').toLowerCase().includes(query))
        .sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
    const maxViews = Math.max(...pages.map(p => p.pageviews || 0), 1);

    const search = (
        <label style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
            background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', maxWidth: '100%',
        }}>
            <Search size={14} aria-hidden="true" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <input
                type="search"
                aria-label="Search pages"
                placeholder="Search pages"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                    background: 'transparent', border: 'none', outline: 'none', minWidth: 0,
                    width: 180, fontSize: '0.8125rem', color: 'var(--color-text-primary)',
                }}
            />
        </label>
    );

    return (
        <div className="page-stack">
            <PageHeader title="Pages" subtitle="Views, time on page, entries and exits for each page." />

            {!selectedDomainId && !domainLoading ? (
                <div className="card"><div className="empty-note">Select a site to see its pages.</div></div>
            ) : (
                <ChartCard
                    title="All pages"
                    subtitle={loading ? undefined : `${filteredPages.length.toLocaleString()} of ${pages.length.toLocaleString()} pages`}
                    action={search}
                    flush
                    loading={loading || domainLoading}
                    height={360}
                >
                    {error ? (
                        <div className="empty-note" role="alert" style={{ color: 'var(--color-error)' }}>
                            Couldn&apos;t load pages: {error}
                        </div>
                    ) : (
                        <div className="dash-table-wrap" style={{ marginTop: 12 }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{ paddingLeft: 20 }}>Page</th>
                                        {COLUMNS.map(col => (
                                            <th
                                                key={col.key}
                                                className="num"
                                                aria-sort={sortBy === col.key ? 'descending' : 'none'}
                                                style={col.key === 'bounceRate' ? { paddingRight: 20 } : undefined}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setSortBy(col.key)}
                                                    style={{
                                                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                                        font: 'inherit', fontWeight: sortBy === col.key ? 600 : 500,
                                                        color: sortBy === col.key ? 'var(--color-text-primary)' : 'inherit',
                                                    }}
                                                >
                                                    {col.label}{sortBy === col.key ? ' ↓' : ''}
                                                </button>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredPages.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="empty-note">
                                                {pages.length === 0 ? 'No pageviews in this period.' : 'No pages match your search.'}
                                            </td>
                                        </tr>
                                    ) : filteredPages.map(page => {
                                        const views = page.pageviews || 0;
                                        const bounce = page.bounceRate || 0;
                                        return (
                                            <tr key={page.path || '/'}>
                                                <td style={{ paddingLeft: 20, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={page.path || '/'}>
                                                    {page.path || '/'}
                                                </td>
                                                <td className="num">
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, verticalAlign: 'middle' }}>
                                                        <span aria-hidden="true" style={{ width: 48, height: 6, borderRadius: 3, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
                                                            <span style={{ display: 'block', height: '100%', width: `${(views / maxViews) * 100}%`, background: 'var(--color-text-muted)', borderRadius: 3 }} />
                                                        </span>
                                                        <span style={{ fontWeight: 500, minWidth: '3.5em' }}>{views.toLocaleString()}</span>
                                                    </span>
                                                </td>
                                                <td className="num">{duration(page.avgTime || 0)}</td>
                                                <td className="num">{(page.entries || 0).toLocaleString()}</td>
                                                <td className="num">{(page.exits || 0).toLocaleString()}</td>
                                                <td className="num" style={{ paddingRight: 20 }}>
                                                    {bounce > HIGH_BOUNCE && (
                                                        <AlertTriangle
                                                            size={12}
                                                            aria-label="High bounce rate"
                                                            style={{ color: 'var(--color-warning)', marginRight: 4, verticalAlign: '-1px' }}
                                                        />
                                                    )}
                                                    {bounce.toFixed(1)}%
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </ChartCard>
            )}
        </div>
    );
}
