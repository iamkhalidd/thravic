'use client';

import { useState, useEffect } from 'react';
import { analytics } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { BarList } from '@/components/charts/BarList';

interface PathsData {
    flows: Array<{ from: string; to: string; count: number; percentage: number }>;
    entries: Array<{ path: string; count: number }>;
    exits: Array<{ path: string; count: number }>;
}

export default function PathsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const range = useApiRange();
    const [data, setData] = useState<PathsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        analytics.getPaths(selectedDomainId, range.start, range.end).then(result => {
            if (cancelled) return;
            setError(result.error ?? null);
            setData(result.data ?? null);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [selectedDomainId, range, domainLoading]);

    const busy = loading || domainLoading;
    const errorNote = error && (
        <div className="empty-note" role="alert" style={{ color: 'var(--color-error)' }}>
            Couldn&apos;t load paths: {error}
        </div>
    );

    return (
        <div className="page-stack">
            <PageHeader title="User paths" subtitle="How visitors move from one page to the next." />

            {!selectedDomainId && !domainLoading ? (
                <div className="card"><div className="empty-note">Select a site to see its user paths.</div></div>
            ) : (
                <>
                    <ChartCard title="Top user flows" subtitle="Page-to-page moves" loading={busy} height={280}>
                        {errorNote || (
                            <BarList
                                items={(data?.flows ?? []).map(f => ({ label: `${f.from} → ${f.to}`, value: f.count }))}
                                labelHeader="From → to"
                                valueHeader="Moves"
                                limit={15}
                                emptyText="Not enough path data in this period."
                            />
                        )}
                    </ChartCard>

                    <div className="dash-grid-2">
                        <ChartCard title="Top entry pages" subtitle="Where sessions start" loading={busy}>
                            {errorNote || (
                                <BarList
                                    items={(data?.entries ?? []).map(e => ({ label: e.path, value: e.count }))}
                                    emptyText="No entries in this period."
                                />
                            )}
                        </ChartCard>
                        <ChartCard title="Top exit pages" subtitle="Where sessions end" loading={busy}>
                            {errorNote || (
                                <BarList
                                    items={(data?.exits ?? []).map(e => ({ label: e.path, value: e.count }))}
                                    emptyText="No exits in this period."
                                />
                            )}
                        </ChartCard>
                    </div>
                </>
            )}
        </div>
    );
}
