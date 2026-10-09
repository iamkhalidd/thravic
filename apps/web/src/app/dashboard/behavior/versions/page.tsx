'use client';

import { useState, useEffect } from 'react';
import { analytics } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { BarList } from '@/components/charts/BarList';

type Breakdown = Array<{ name: string; sessions: number; percentage: number }>;

/** An app's sessions by the version people run, and the OS versions under it. */
export default function VersionsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const range = useApiRange();
    const [versions, setVersions] = useState<Breakdown>([]);
    const [systems, setSystems] = useState<Breakdown>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }
        let cancelled = false;
        if (!range.background) setLoading(true);
        analytics.getDevices(selectedDomainId, range.start, range.end).then(result => {
            if (cancelled) return;
            setError(result.error ?? null);
            setVersions(result.data?.appVersions ?? []);
            setSystems(result.data?.operatingSystems ?? []);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [selectedDomainId, range, domainLoading]);

    const busy = loading || domainLoading;
    const errorNote = error && (
        <div className="empty-note" role="alert" style={{ color: 'var(--color-error)' }}>
            Couldn&apos;t load versions: {error}
        </div>
    );
    // Sessions from before appVersion was passed to Thravic.init come back as "Unknown".
    const unknown = versions.some(v => v.name === 'Unknown');

    return (
        <div className="page-stack">
            <PageHeader title="Versions" subtitle="Which versions of your app people are using." />

            <div className="dash-grid-2">
                <ChartCard title="App versions" subtitle="Sessions" loading={busy}>
                    {errorNote || (
                        <>
                            <BarList
                                items={versions.map(v => ({ label: v.name, value: v.sessions }))}
                                labelHeader="Version"
                                valueHeader="Sessions"
                                limit={20}
                                emptyText="No sessions in this period."
                            />
                            {unknown && (
                                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '10px 0 0' }}>
                                    &ldquo;Unknown&rdquo; is sessions without a version: pass <code>appVersion</code> to <code>Thravic.init</code> to see it.
                                </p>
                            )}
                        </>
                    )}
                </ChartCard>
                <ChartCard title="Operating systems" subtitle="Sessions" loading={busy}>
                    {errorNote || (
                        <BarList
                            items={systems.map(s => ({ label: s.name, value: s.sessions }))}
                            labelHeader="OS"
                            valueHeader="Sessions"
                            limit={10}
                            emptyText="No sessions in this period."
                        />
                    )}
                </ChartCard>
            </div>
        </div>
    );
}
