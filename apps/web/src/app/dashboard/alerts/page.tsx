'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, Gauge, MousePointerClick, TrendingDown, TrendingUp, WifiOff, type LucideIcon } from 'lucide-react';
import { alerts as alertsApi, type AlertKind, type SiteAlert } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { PageHeader } from '@/components/PageHeader';

const KIND_ICON: Record<AlertKind, { icon: LucideIcon; color: string }> = {
    traffic_drop: { icon: TrendingDown, color: 'var(--color-error)' },
    traffic_spike: { icon: TrendingUp, color: 'var(--color-success)' },
    silent: { icon: WifiOff, color: 'var(--color-error)' },
    new_error: { icon: AlertTriangle, color: 'var(--color-error)' },
    rage_clicks: { icon: MousePointerClick, color: 'var(--color-warning)' },
    slow_page: { icon: Gauge, color: 'var(--color-warning)' },
};

function when(iso: string): string {
    const date = new Date(iso);
    const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
    if (minutes < 60) return `${Math.max(minutes, 1)} min ago`;
    if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function AlertsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [list, setList] = useState<SiteAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        alertsApi.list(selectedDomainId).then(({ data, error }) => {
            if (cancelled) return;
            setList(data?.alerts ?? []);
            setLoadError(data ? null : error || 'Could not load alerts');
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [selectedDomainId, domainLoading]);

    const header = (
        <PageHeader
            title="Alerts"
            subtitle="What changed on this site compared with a normal day. Checked every hour."
            actions={<Link href="/dashboard/settings?tab=notifications" className="btn btn-secondary">Alert emails</Link>}
        />
    );

    if (!selectedDomainId && !domainLoading) {
        return (
            <div className="page-stack">
                {header}
                <div className="card empty-note">Select a website to see its alerts.</div>
            </div>
        );
    }

    return (
        <div className="page-stack">
            {header}
            {loading || domainLoading ? (
                <div className="skeleton" style={{ height: 160 }} />
            ) : loadError ? (
                <div role="alert" className="card" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{loadError}</div>
            ) : list.length === 0 ? (
                <div className="card empty-note" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Bell size={16} aria-hidden="true" />
                    No alerts yet. Thravic will tell you here and by email when traffic, errors, rage clicks or page speed change sharply.
                </div>
            ) : (
                <div className="card" style={{ padding: 0 }}>
                    {list.map((alert, index) => {
                        const { icon: Icon, color } = KIND_ICON[alert.kind] ?? { icon: Bell, color: 'var(--color-text-muted)' };
                        return (
                            <div key={alert.id} style={{
                                display: 'flex', gap: 14, padding: '16px 20px',
                                borderTop: index === 0 ? 'none' : '1px solid var(--color-border)',
                            }}>
                                <Icon size={18} aria-hidden="true" style={{ color, flexShrink: 0, marginTop: 2 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>{alert.title}</div>
                                        <div className="muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{when(alert.createdAt)}</div>
                                    </div>
                                    <p style={{ margin: '4px 0 8px', fontSize: '0.8125rem', lineHeight: 1.55, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>
                                        {alert.message}
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: '0.8125rem' }}>
                                        {alert.link && <Link href={alert.link}>Open</Link>}
                                        {alert.recordings.map((id, n) => (
                                            <Link key={id} href={`/dashboard/sessions?recording=${id}`}>Watch recording {n + 1}</Link>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
