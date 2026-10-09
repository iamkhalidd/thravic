'use client';

import { useState, useEffect } from 'react';
import { Monitor, Smartphone, Tablet, HelpCircle } from 'lucide-react';
import { analytics } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { BarList } from '@/components/charts/BarList';
import { isApp } from '@/lib/platform';

type Breakdown = Array<{ name: string; sessions: number; percentage: number }>;

interface DevicesData {
    devices: Breakdown;
    browsers: Breakdown;
    operatingSystems: Breakdown;
    deviceModels?: Breakdown;
}

const DEVICE_ICONS: Record<string, typeof Monitor> = {
    desktop: Monitor,
    mobile: Smartphone,
    tablet: Tablet,
};

function deviceIcon(name: string) {
    const Icon = DEVICE_ICONS[name.toLowerCase()] ?? HelpCircle;
    return <Icon size={14} />;
}

export default function DevicesPage() {
    const { selectedDomainId, selectedDomain, loading: domainLoading } = useDomain();
    // An app has no browser; its device models take that card.
    const app = isApp(selectedDomain);
    const range = useApiRange();
    const [data, setData] = useState<DevicesData | null>(null);
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
            setData(result.data ?? null);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [selectedDomainId, range, domainLoading]);

    const busy = loading || domainLoading;
    const errorNote = error && (
        <div className="empty-note" role="alert" style={{ color: 'var(--color-error)' }}>
            Couldn&apos;t load device data: {error}
        </div>
    );

    const devices = (data?.devices ?? [])
        .filter(d => d.name.toLowerCase() !== 'unknown')
        .map(d => ({ label: d.name, value: d.sessions, icon: deviceIcon(d.name) }));
    const browsers = ((app ? data?.deviceModels : data?.browsers) ?? []).map(b => ({ label: b.name, value: b.sessions }));
    const systems = (data?.operatingSystems ?? []).map(o => ({ label: o.name, value: o.sessions }));

    return (
        <div className="page-stack">
            <PageHeader
                title="Devices"
                subtitle={app
                    ? 'Sessions by device type, model and operating system.'
                    : 'Sessions by device type, browser and operating system.'}
            />

            {!selectedDomainId && !domainLoading ? (
                <div className="card"><div className="empty-note">Select a site to see its devices.</div></div>
            ) : (
                <div className="dash-grid-3">
                    <ChartCard title="Device type" subtitle="Sessions" loading={busy}>
                        {errorNote || <BarList items={devices} emptyText="No sessions in this period." />}
                    </ChartCard>
                    <ChartCard title={app ? 'Device models' : 'Browsers'} subtitle="Sessions" loading={busy}>
                        {errorNote || <BarList items={browsers} limit={10} emptyText="No sessions in this period." />}
                    </ChartCard>
                    <ChartCard title="Operating systems" subtitle="Sessions" loading={busy}>
                        {errorNote || <BarList items={systems} limit={10} emptyText="No sessions in this period." />}
                    </ChartCard>
                </div>
            )}
        </div>
    );
}
