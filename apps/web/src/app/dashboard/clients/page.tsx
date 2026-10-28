'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { agency, type ClientSite } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useSubscription } from '@/hooks/useSubscription';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { UpgradeGate } from '@/components/UpgradeGate';

const PERIODS = [7, 30] as const;

function Change({ pct }: { pct: number | null }) {
    if (pct === null) return <span className="muted">—</span>;
    return (
        <span className={`stat-change ${pct >= 0 ? 'positive' : 'negative'}`}>
            {pct >= 0 ? '+' : '−'}{Math.abs(pct)}%
        </span>
    );
}

function monthLabel(key: string | null): string {
    if (!key) return '';
    const [year, month] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Clients (Agency plan): every site you own or manage, the ones needing a look first. */
export default function ClientsPage() {
    const router = useRouter();
    const { setSelectedDomainId } = useDomain();
    const { hasFeature, loading: subLoading } = useSubscription();
    const enabled = hasFeature('client_overview');

    const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
    const [sites, setSites] = useState<ClientSite[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setSites(null);
        agency.overview(days).then(result => {
            if (cancelled) return;
            if (result.data) setSites(result.data.sites);
            else setError(result.error || 'Could not load your clients');
        });
        return () => { cancelled = true; };
    }, [enabled, days]);

    const open = (id: string) => {
        setSelectedDomainId(id);
        router.push('/dashboard');
    };

    const header = (
        <PageHeader
            title="Clients"
            subtitle="All your sites at a glance. Sites that need a look come first."
            actions={enabled && (
                <div role="group" aria-label="Period" style={{ display: 'flex', gap: 4 }}>
                    {PERIODS.map(p => (
                        <button
                            key={p}
                            className={`btn ${p === days ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
                            aria-pressed={p === days}
                            onClick={() => setDays(p)}
                        >
                            Last {p} days
                        </button>
                    ))}
                </div>
            )}
        />
    );

    if (subLoading) return <div className="page-stack">{header}</div>;
    if (!enabled) {
        return (
            <div className="page-stack">
                {header}
                <UpgradeGate feature="client_overview" requiredPlan="agency" message="See every client's site on one page, with the ones that need you on top." />
            </div>
        );
    }

    const attention = sites?.filter(s => s.attention.length).length ?? 0;

    return (
        <div className="page-stack">
            {header}
            {error && <div role="alert" className="card" style={{ padding: '12px 16px', color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</div>}

            <ChartCard
                flush
                loading={sites === null && !error}
                height={200}
                title={sites ? `${sites.length} ${sites.length === 1 ? 'site' : 'sites'}` : 'Sites'}
                subtitle={sites && (attention ? `${attention} need${attention === 1 ? 's' : ''} a look` : 'All looking fine')}
            >
                {sites && sites.length ? (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left' }}>Site</th>
                                    <th className="num">Visitors</th>
                                    <th className="num">Change</th>
                                    <th className="num">Conversions</th>
                                    <th className="num">Alerts (7 days)</th>
                                    <th style={{ textAlign: 'left' }}>Last report</th>
                                    <th style={{ textAlign: 'left' }}>Needs a look</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sites.map(site => (
                                    <tr key={site.id} onClick={() => open(site.id)} style={{ cursor: 'pointer' }}>
                                        <td>
                                            <button
                                                onClick={e => { e.stopPropagation(); open(site.id); }}
                                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'var(--color-text-primary)', font: 'inherit' }}
                                            >
                                                <div style={{ fontWeight: 500 }}>{site.name}</div>
                                                {site.name !== site.domain && <div className="muted" style={{ fontSize: '0.75rem' }}>{site.domain}</div>}
                                            </button>
                                        </td>
                                        <td className="num">{site.visitors.toLocaleString()}</td>
                                        <td className="num"><Change pct={site.visitorsChangePct} /></td>
                                        <td className="num">{site.conversions.toLocaleString()} <Change pct={site.conversionsChangePct} /></td>
                                        <td className="num">{site.openAlerts || <span className="muted">0</span>}</td>
                                        <td>
                                            {site.lastReportAt
                                                ? <>{monthLabel(site.lastReportMonth)} <span className="muted">· sent {new Date(site.lastReportAt).toLocaleDateString()}</span></>
                                                : <span className="muted">{site.reportsOn ? 'Not sent yet' : 'Off'}</span>}
                                        </td>
                                        <td>
                                            {site.attention.length ? (
                                                <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start', color: 'var(--color-warning)' }}>
                                                    <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                                                    <span>{site.attention.join(' · ')}</span>
                                                </span>
                                            ) : (
                                                <span className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    <CheckCircle2 size={14} aria-hidden="true" /> Fine
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : sites ? (
                    <div className="empty-note" style={{ padding: '0 20px 20px' }}>No sites yet.</div>
                ) : null}
            </ChartCard>
        </div>
    );
}
