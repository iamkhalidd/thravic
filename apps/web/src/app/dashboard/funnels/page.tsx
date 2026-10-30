'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Users, Target, TrendingDown, Percent } from 'lucide-react';
import { authFetch } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useApiRange } from '@/contexts/DateRangeContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';
import { FunnelColumns } from '@/components/charts/FunnelColumns';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Funnel {
    id: string;
    name: string;
    description: string;
    stepsCount: number;
    createdAt: string;
}

interface FunnelMetrics {
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
    return {
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
    const res = await authFetch(`${API_URL}/api/funnels/${domainId}`);
    return res.json();
}

async function getFunnelDetails(domainId: string, funnelId: string, start: string, end: string) {
    const params = new URLSearchParams({ startDate: start, endDate: end });
    const res = await authFetch(`${API_URL}/api/funnels/${domainId}/${funnelId}?${params}`);
    return res.json();
}

async function deleteFunnel(domainId: string, funnelId: string) {
    await authFetch(`${API_URL}/api/funnels/${domainId}/${funnelId}`, {
        method: 'DELETE'
    });
}

/** "Of 1,200 people who started, 96 finished. Most left after "Add to cart"." */
function funnelSummary(steps: Array<{ name: string; visitors: number }>) {
    const first = steps[0]?.visitors ?? 0;
    if (first <= 0) return 'Nobody started this funnel in this period.';
    const last = steps[steps.length - 1].visitors;
    let worst = -1;
    let worstRate = 0;
    steps.slice(1).forEach((step, i) => {
        const before = steps[i].visitors;
        const rate = before > 0 ? (before - step.visitors) / before : 0;
        if (rate > worstRate) { worstRate = rate; worst = i; }
    });
    return (
        <>
            Of <strong>{first.toLocaleString()}</strong> people who started, <strong>{last.toLocaleString()}</strong> finished.
            {worst >= 0 && <> Most left after <strong>{steps[worst].name}</strong>, so start there.</>}
        </>
    );
}

export default function FunnelsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const range = useApiRange();
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

        if (!range.background) setLoading(true);
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
        getFunnelDetails(selectedDomainId, selectedFunnel, range.start, range.end).then(data => {
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
    }, [selectedDomainId, selectedFunnel, range]);

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
                                    loading={detailLoading}
                                    title={current?.name ?? 'Funnel'}
                                    subtitle="People who reached each step in the selected period"
                                    info="Each column is the people who reached that step, as a share of those who started. The chip between two steps shows how many left there."
                                >
                                    {funnelMetrics && funnelMetrics.steps.length > 0 ? (
                                        <>
                                            <div className="funnel-head">
                                                <p className="chart-summary">{funnelSummary(funnelMetrics.steps)}</p>
                                                <div className="funnel-total">
                                                    <b>{Number(funnelMetrics.overallConversionRate ?? 0).toFixed(1)}%</b>
                                                    <small>finish all steps</small>
                                                </div>
                                            </div>
                                            <FunnelColumns steps={funnelMetrics.steps.map(step => ({ id: step.stepId, name: step.name, visitors: step.visitors }))} />
                                        </>
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
