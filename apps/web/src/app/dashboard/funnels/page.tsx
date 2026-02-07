'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Target,
    Plus,
    ArrowRight,
    Trash2,
    MoreVertical,
    TrendingDown,
    Users,
    ChevronRight
} from 'lucide-react';
import { domains } from '@/lib/api';

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
    const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
    const [funnelList, setFunnelList] = useState<Funnel[]>([]);
    const [selectedFunnel, setSelectedFunnel] = useState<string | null>(null);
    const [funnelMetrics, setFunnelMetrics] = useState<FunnelMetrics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        domains.list().then(result => {
            if (result.data && result.data.domains.length > 0) {
                setSelectedDomainId(result.data.domains[0].id);
            } else {
                setLoading(false);
            }
        });
    }, []);

    useEffect(() => {
        if (!selectedDomainId) return;

        setLoading(true);
        getFunnels(selectedDomainId).then(data => {
            setFunnelList(data.funnels || []);
            setLoading(false);
        });
    }, [selectedDomainId]);

    useEffect(() => {
        if (!selectedDomainId || !selectedFunnel) return;

        getFunnelDetails(selectedDomainId, selectedFunnel).then(data => {
            setFunnelMetrics(data.metrics);
        });
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

    if (loading) {
        return (
            <div>
                <div className="skeleton" style={{ height: '40px', width: '200px', marginBottom: 'var(--space-xl)' }} />
                <div className="grid grid-cols-3 gap-lg">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="card">
                            <div className="skeleton" style={{ height: '100px' }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-xl)' }}>
                <h1>Conversion Funnels</h1>
                <Link href="/dashboard/funnels/new" className="btn btn-primary">
                    <Plus size={18} />
                    Create Funnel
                </Link>
            </div>

            {funnelList.length === 0 ? (
                // Empty State
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
                    <Target size={48} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }} />
                    <h3 style={{ marginBottom: 'var(--space-sm)' }}>No funnels yet</h3>
                    <p style={{ marginBottom: 'var(--space-lg)' }}>
                        Create your first funnel to track conversion paths
                    </p>
                    <Link href="/dashboard/funnels/new" className="btn btn-primary">
                        <Plus size={18} />
                        Create Funnel
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-lg">
                    {/* Funnel List */}
                    <div style={{ gridColumn: 'span 1' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                            {funnelList.map(funnel => (
                                <div
                                    key={funnel.id}
                                    className="card"
                                    onClick={() => setSelectedFunnel(funnel.id)}
                                    style={{
                                        cursor: 'pointer',
                                        borderColor: selectedFunnel === funnel.id ? 'var(--color-accent-primary)' : undefined
                                    }}
                                >
                                    <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-sm)' }}>
                                        <h4>{funnel.name}</h4>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(funnel.id);
                                            }}
                                            className="btn btn-ghost"
                                            style={{ padding: 'var(--space-xs)' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
                                        {funnel.description || 'No description'}
                                    </p>
                                    <div className="flex items-center gap-sm">
                                        <span className="badge">{funnel.stepsCount} steps</span>
                                        <ChevronRight size={16} style={{ color: 'var(--color-text-muted)', marginLeft: 'auto' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Funnel Visualization */}
                    <div style={{ gridColumn: 'span 2' }}>
                        {selectedFunnel && funnelMetrics ? (
                            <div className="card">
                                <div className="card-header" style={{ marginBottom: 'var(--space-lg)' }}>
                                    <h4 className="card-title">Funnel Performance</h4>
                                    <div className="flex items-center gap-md">
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                                {funnelMetrics.overallConversionRate}%
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                Overall Conversion
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Summary Stats */}
                                <div className="grid grid-cols-3 gap-md" style={{ marginBottom: 'var(--space-xl)' }}>
                                    <div style={{
                                        padding: 'var(--space-md)',
                                        background: 'var(--color-bg-secondary)',
                                        borderRadius: 'var(--radius-md)'
                                    }}>
                                        <div className="flex items-center gap-sm" style={{ marginBottom: 'var(--space-xs)' }}>
                                            <Users size={16} style={{ color: 'var(--color-accent-primary)' }} />
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Entered</span>
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{funnelMetrics.totalVisitors}</div>
                                    </div>
                                    <div style={{
                                        padding: 'var(--space-md)',
                                        background: 'var(--color-bg-secondary)',
                                        borderRadius: 'var(--radius-md)'
                                    }}>
                                        <div className="flex items-center gap-sm" style={{ marginBottom: 'var(--space-xs)' }}>
                                            <Target size={16} style={{ color: 'var(--color-success)' }} />
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Completed</span>
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{funnelMetrics.completedFunnel}</div>
                                    </div>
                                    <div style={{
                                        padding: 'var(--space-md)',
                                        background: 'var(--color-bg-secondary)',
                                        borderRadius: 'var(--radius-md)'
                                    }}>
                                        <div className="flex items-center gap-sm" style={{ marginBottom: 'var(--space-xs)' }}>
                                            <TrendingDown size={16} style={{ color: 'var(--color-error)' }} />
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Dropped</span>
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                                            {funnelMetrics.totalVisitors - funnelMetrics.completedFunnel}
                                        </div>
                                    </div>
                                </div>

                                {/* Funnel Steps Visualization */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                                    {funnelMetrics.steps.map((step, index) => {
                                        const widthPercent = funnelMetrics.totalVisitors > 0
                                            ? (step.visitors / funnelMetrics.totalVisitors) * 100
                                            : 0;

                                        return (
                                            <div key={step.stepId}>
                                                <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-xs)' }}>
                                                    <div className="flex items-center gap-sm">
                                                        <span style={{
                                                            width: '24px',
                                                            height: '24px',
                                                            borderRadius: 'var(--radius-full)',
                                                            background: 'var(--color-accent-gradient)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600
                                                        }}>
                                                            {step.order}
                                                        </span>
                                                        <span style={{ fontWeight: 500 }}>{step.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-md">
                                                        <span style={{ fontSize: '0.875rem' }}>{step.visitors} visitors</span>
                                                        {index > 0 && (
                                                            <span style={{
                                                                fontSize: '0.75rem',
                                                                color: step.dropoffRate > 50 ? 'var(--color-error)' : 'var(--color-text-muted)'
                                                            }}>
                                                                {step.dropoffRate.toFixed(1)}% drop
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={{
                                                    height: '32px',
                                                    background: 'var(--color-bg-secondary)',
                                                    borderRadius: 'var(--radius-md)',
                                                    overflow: 'hidden'
                                                }}>
                                                    <div style={{
                                                        height: '100%',
                                                        width: `${Math.max(widthPercent, 2)}%`,
                                                        background: index === funnelMetrics.steps.length - 1
                                                            ? 'var(--color-success)'
                                                            : 'var(--color-accent-primary)',
                                                        borderRadius: 'var(--radius-md)',
                                                        transition: 'width 0.5s ease'
                                                    }} />
                                                </div>
                                                {index < funnelMetrics.steps.length - 1 && (
                                                    <div style={{
                                                        display: 'flex',
                                                        justifyContent: 'center',
                                                        padding: 'var(--space-xs) 0'
                                                    }}>
                                                        <ArrowRight size={16} style={{
                                                            color: 'var(--color-text-muted)',
                                                            transform: 'rotate(90deg)'
                                                        }} />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="card" style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: '400px',
                                color: 'var(--color-text-muted)'
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <Target size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                                    <p>Select a funnel to view details</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
