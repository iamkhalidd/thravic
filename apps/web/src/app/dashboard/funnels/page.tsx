'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Users, Target, TrendingDown, Percent } from 'lucide-react';
import { useDomain } from '@/contexts/DomainContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Funnel {
    id: string;
    name: string;
    description: string;
    stepsCount: number;
    createdAt: string;
}

interface FunnelMetrics {
    /** Length of the window the API measured, in days (it ignores the date picker). */
    periodDays: number | null;
    totalVisitors: number;
    completedFunnel: number;
    overallConversionRate: number;
    steps: Array<{
        stepId: string;
        name: string;
        order: number;
        visitors: number;
        conversions: number;
        dropoffs: number;
        dropoffRate: number;
        conversionRate: number;
    }>;
}

// GET /api/funnels/{domainId}/{funnelId} returns the steps with `visitors` (who
// reached the step after the previous one), `dropoff`, `dropoffRate` and
// `conversionRate`, plus `totalVisitors`, `completedFunnel` and `overallConversion`.
function toMetrics(data: any): FunnelMetrics | null {
    if (!data || !Array.isArray(data.steps)) return null;
    const start = data.period?.start ? new Date(data.period.start).getTime() : NaN;
    const end = data.period?.end ? new Date(data.period.end).getTime() : NaN;
    return {
        periodDays: Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400000) : null,
        totalVisitors: data.totalVisitors ?? 0,
        completedFunnel: data.completedFunnel ?? 0,
        overallConversionRate: data.overallConversion ?? 0,
        steps: data.steps.map((step: any) => ({
            stepId: step.id,
            name: step.name,
            order: step.order,
            visitors: step.visitors ?? 0,
            conversions: step.visitors ?? 0,
            dropoffs: step.dropoff ?? 0,
            dropoffRate: step.dropoffRate ?? 0,
            conversionRate: step.conversionRate ?? 0,
        })),
    };
}

async function getFunnels(domainId: string) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_URL}/api/funnels/${domainId}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}

async function getFunnelDetails(domainId: string, funnelId: string) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_URL}/api/funnels/${domainId}/${funnelId}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}

async function deleteFunnel(domainId: string, funnelId: string) {
    const token = localStorage.getItem('accessToken');
    await fetch(`${API_URL}/api/funnels/${domainId}/${funnelId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
}

export default function FunnelsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [funnelList, setFunnelList] = useState<Funnel[]>([]);
    const [selectedFunnel, setSelectedFunnel] = useState<string | null>(null);
    const [funnelMetrics, setFunnelMetrics] = useState<FunnelMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedDomainId) {
            if (!domainLoading) setLoading(false);
            return;
        }

        setLoading(true);
        setSelectedFunnel(null);
        setFunnelMetrics(null);
        getFunnels(selectedDomainId).then(data => {
            const list: Funnel[] = data.funnels || [];
            setListError(data.funnels ? null : (data.error || 'Something went wrong'));
            setFunnelList(list);
            // Open the first funnel so the page shows a result straight away.
            setSelectedFunnel(list[0]?.id ?? null);
            setLoading(false);
        }).catch(() => {
            setListError('Something went wrong');
            setLoading(false);
        });
    }, [selectedDomainId, domainLoading]);

    useEffect(() => {
        if (!selectedDomainId || !selectedFunnel) return;
        let cancelled = false;

        setDetailLoading(true);
        setDetailError(null);
        getFunnelDetails(selectedDomainId, selectedFunnel).then(data => {
            if (cancelled) return;
            const metrics = toMetrics(data);
            setFunnelMetrics(metrics);
            setDetailError(metrics ? null : (data?.error || 'Something went wrong'));
            setDetailLoading(false);
        }).catch(() => {
            if (cancelled) return;
            setFunnelMetrics(null);
            setDetailError('Something went wrong');
            setDetailLoading(false);
        });
        return () => { cancelled = true; };
    }, [selectedDomainId, selectedFunnel]);

    const handleDelete = async (funnelId: string) => {
        if (!selectedDomainId || !confirm('Delete this funnel?')) return;

        await deleteFunnel(selectedDomainId, funnelId);
        setFunnelList(prev => prev.filter(f => f.id !== funnelId));
        if (selectedFunnel === funnelId) {
            setSelectedFunnel(null);
            setFunnelMetrics(null);
        }
    };

    const createButton = (
        <Link href="/dashboard/funnels/new" className="btn btn-primary">
            <Plus size={16} />
            Create funnel
        </Link>
    );

    if (loading) {
        return (
            <div className="page-stack">
                <div className="skeleton" style={{ height: '28px', width: '180px' }} />
                <div className="stat-grid">
                    {[1, 2, 3, 4].map(i => <StatCard key={i} label="" value="" loading />)}
                </div>
                <div className="split-grid">
                    <div className="card"><div className="skeleton" style={{ height: '240px' }} /></div>
                    <div className="card"><div className="skeleton" style={{ height: '240px' }} /></div>
                </div>
            </div>
        );
    }

    const current = funnelList.find(f => f.id === selectedFunnel);
    const first = funnelMetrics?.steps[0]?.visitors ?? 0;

    return (
        <div className="page-stack">
            <PageHeader
                title="Funnels"
                subtitle="See where visitors drop off on the way to a goal."
                actions={createButton}
            />

            {listError ? (
                <div className="card" role="alert" style={{ borderColor: 'var(--color-error)' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-error)', margin: 0 }}>
                        Could not load funnels: {listError}
                    </p>
                </div>
            ) : funnelList.length === 0 ? (
                <ChartCard title="Your funnels">
                    <div className="empty-note">
                        No funnels yet. Create one to track a conversion path step by step.
                    </div>
                </ChartCard>
            ) : (
                <div className="split-grid" style={{ alignItems: 'start' }}>
                    <div className="page-stack" style={{ minWidth: 0 }}>
                        {!selectedFunnel ? (
                            <ChartCard title="Funnel">
                                <div className="empty-note">Select a funnel to see its steps.</div>
                            </ChartCard>
                        ) : detailError ? (
                            <div className="card" role="alert" style={{ borderColor: 'var(--color-error)' }}>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-error)', margin: 0 }}>
                                    Could not load this funnel: {detailError}
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="stat-grid">
                                    <StatCard label="Entered" icon={Users} loading={detailLoading}
                                        value={(funnelMetrics?.totalVisitors ?? 0).toLocaleString()} />
                                    <StatCard label="Completed" icon={Target} loading={detailLoading}
                                        value={(funnelMetrics?.completedFunnel ?? 0).toLocaleString()} />
                                    <StatCard label="Dropped" icon={TrendingDown} loading={detailLoading}
                                        value={((funnelMetrics?.totalVisitors ?? 0) - (funnelMetrics?.completedFunnel ?? 0)).toLocaleString()} />
                                    <StatCard label="Conversion" icon={Percent} loading={detailLoading}
                                        value={`${Number(funnelMetrics?.overallConversionRate ?? 0).toFixed(1)}%`}
                                        hint="Entered to completed" />
                                </div>

                                <ChartCard
                                    flush
                                    loading={detailLoading}
                                    title={current?.name ?? 'Funnel'}
                                    subtitle={funnelMetrics?.periodDays
                                        ? `Visitors who reached each step, last ${funnelMetrics.periodDays} days`
                                        : 'Visitors who reached each step'}
                                >
                                    {funnelMetrics && funnelMetrics.steps.length > 0 ? (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table className="data-table" style={{ marginTop: 6 }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ paddingLeft: 20 }}>Step</th>
                                                        <th className="num">Visitors</th>
                                                        <th className="num" title="Share of the previous step's visitors who reached this one">Step conversion</th>
                                                        <th className="num" style={{ paddingRight: 20 }}>Drop-off</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {funnelMetrics.steps.map((step, index) => {
                                                        const width = first > 0 ? Math.max((step.visitors / first) * 100, 1.5) : 0;
                                                        return (
                                                            <tr key={step.stepId}>
                                                                <td style={{ paddingLeft: 20, width: '55%', minWidth: 200 }}>
                                                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minHeight: 26, padding: '0 8px' }}>
                                                                        <span aria-hidden="true" style={{
                                                                            position: 'absolute', inset: '0 auto 0 0', width: `${width}%`,
                                                                            background: 'var(--chart-bar)', borderLeft: width > 0 ? '2px solid var(--chart-1)' : undefined,
                                                                            borderRadius: 4,
                                                                        }} />
                                                                        <span style={{ position: 'relative', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', fontSize: '0.75rem' }}>
                                                                            {index + 1}
                                                                        </span>
                                                                        <span style={{ position: 'relative', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={step.name}>
                                                                            {step.name}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="num" style={{ fontWeight: 500 }}>{step.visitors.toLocaleString()}</td>
                                                                <td className="num">{index === 0 ? <span className="muted">—</span> : `${step.conversionRate.toFixed(1)}%`}</td>
                                                                <td className="num muted" style={{ paddingRight: 20 }}>
                                                                    {index === 0 ? '—' : `${step.dropoffs.toLocaleString()} (${step.dropoffRate.toFixed(1)}%)`}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="empty-note">This funnel has no steps.</div>
                                    )}
                                </ChartCard>
                            </>
                        )}
                    </div>

                    <ChartCard flush title="Your funnels" subtitle={`${funnelList.length} ${funnelList.length === 1 ? 'funnel' : 'funnels'}`}>
                        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, borderTop: '1px solid var(--color-border)' }}>
                            {funnelList.map(funnel => {
                                const active = selectedFunnel === funnel.id;
                                return (
                                    <li
                                        key={funnel.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            borderBottom: '1px solid var(--color-border)',
                                            background: active ? 'var(--color-bg-hover)' : undefined,
                                            boxShadow: active ? 'inset 2px 0 0 var(--color-accent-primary)' : undefined,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setSelectedFunnel(funnel.id)}
                                            aria-current={active ? 'true' : undefined}
                                            style={{
                                                flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1,
                                                padding: '8px 4px 8px 16px', background: 'transparent', border: 'none',
                                                cursor: 'pointer', textAlign: 'left', color: 'var(--color-text-primary)',
                                            }}
                                        >
                                            <span style={{ fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {funnel.name}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {funnel.stepsCount} {funnel.stepsCount === 1 ? 'step' : 'steps'}
                                                {funnel.description ? ` · ${funnel.description}` : ''}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(funnel.id)}
                                            className="btn btn-ghost"
                                            aria-label={`Delete funnel ${funnel.name}`}
                                            title="Delete funnel"
                                            style={{ padding: 6, marginRight: 10, color: 'var(--color-text-secondary)' }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </ChartCard>
                </div>
            )}
        </div>
    );
}
