'use client';

import { useState, useEffect } from 'react';
import { MousePointerClick, Hash, Search, FileText } from 'lucide-react';
import { customEvents } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';

type RageClick = {
    tag: string | null;
    element_id: string | null;
    text: string | null;
    url: string;
    count: number;
    avg_click_count: number;
};

/** `button#checkout "Pay now"` — whichever parts the tracker captured. */
function describeElement(click: RageClick): string {
    const selector = `${(click.tag || 'element').toLowerCase()}${click.element_id ? `#${click.element_id}` : ''}`;
    return click.text ? `${selector} "${click.text}"` : selector;
}

function pathOf(url: string): string {
    try {
        return new URL(url).pathname;
    } catch {
        return url;
    }
}

export default function RageClicksPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const range = useApiRange();
    const [data, setData] = useState<{ totalRageClicks: number; rageClicks: RageClick[] } | null>(null);
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
            const result = await customEvents.getRageClicks(selectedDomainId, range.start, range.end);
            if (cancelled) return;
            setData(result.data ?? null);
            setLoadError(result.data ? null : result.error || 'Could not load rage clicks');
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [selectedDomainId, range, domainLoading]);

    const header = (
        <PageHeader title="Rage clicks" subtitle="Elements visitors clicked repeatedly in frustration" />
    );

    if (!selectedDomainId && !domainLoading) {
        return (
            <div className="page-stack">
                {header}
                <div className="card empty-note">Select a website to see its rage clicks.</div>
            </div>
        );
    }

    const busy = loading || domainLoading;
    const rageClicks = data?.rageClicks ?? [];
    const query = searchQuery.trim().toLowerCase();
    const filtered = rageClicks.filter(click =>
        describeElement(click).toLowerCase().includes(query) ||
        click.url.toLowerCase().includes(query)
    );
    const affectedPages = new Set(rageClicks.map(click => pathOf(click.url))).size;

    return (
        <div className="page-stack">
            {header}

            {loadError && !busy && (
                <div role="alert" className="card" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>
                    {loadError}
                </div>
            )}

            <div className="stat-grid">
                <StatCard label="Rage clicks" icon={MousePointerClick} loading={busy}
                    value={(data?.totalRageClicks ?? 0).toLocaleString()} />
                <StatCard label="Elements" icon={Hash} loading={busy}
                    value={rageClicks.length.toLocaleString()} />
                <StatCard label="Pages affected" icon={FileText} loading={busy}
                    value={affectedPages.toLocaleString()} />
            </div>

            <ChartCard
                title="Frustrated elements"
                subtitle="Most rage clicks first"
                flush
                loading={busy}
                action={
                    <label style={{ position: 'relative', flex: '0 1 240px', minWidth: 140 }}>
                        <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="search"
                            className="input"
                            aria-label="Search elements or pages"
                            placeholder="Search elements or pages…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ padding: '6px 10px 6px 30px', fontSize: '0.8125rem' }}
                        />
                    </label>
                }
            >
                {loadError ? (
                    <p className="empty-note">Rage clicks could not be loaded.</p>
                ) : filtered.length === 0 ? (
                    <p className="empty-note">
                        {rageClicks.length === 0 ? 'No rage clicks in this period.' : 'No rage clicks match your search.'}
                    </p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: 20 }}>Element</th>
                                    <th>Page</th>
                                    <th className="num">Rage clicks</th>
                                    <th className="num" style={{ paddingRight: 20 }}>Avg. clicks per burst</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((click, idx) => (
                                    <tr key={idx}>
                                        <td style={{ paddingLeft: 20, maxWidth: 380 }}>
                                            <div title={describeElement(click)} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                                                {describeElement(click)}
                                            </div>
                                        </td>
                                        <td className="muted" style={{ maxWidth: 260 }}>
                                            <div title={click.url} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {pathOf(click.url)}
                                            </div>
                                        </td>
                                        <td className="num" style={{ fontWeight: 500 }}>{Number(click.count).toLocaleString()}</td>
                                        <td className="num muted" style={{ paddingRight: 20 }}>
                                            {click.avg_click_count ?? '—'}
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
