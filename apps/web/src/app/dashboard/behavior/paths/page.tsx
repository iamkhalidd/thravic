'use client';

import { useState, useEffect } from 'react';
import {
    ArrowRight,
    Circle
} from 'lucide-react';
import { analytics } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';

export default function PathsPage() {
    const { selectedDomainId, loading: domainLoading } = useDomain();
    const [data, setData] = useState<{
        flows: Array<{ from: string; to: string; count: number; percentage: number }>;
        entries: Array<{ path: string; count: number }>;
        exits: Array<{ path: string; count: number }>;
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadPaths = async () => {
            if (!selectedDomainId) return;
            setLoading(true);
            const result = await analytics.getPaths(selectedDomainId);
            if (result.data) {
                setData(result.data);
            }
            setLoading(false);
        };

        if (selectedDomainId) {
            loadPaths();
        }
    }, [selectedDomainId]);


    if (domainLoading || loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-xl)' }}>
                <div className="loading-spinner" />
            </div>
        );
    }

    if (!selectedDomainId) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
                <p>Please select a domain to view user paths</p>
            </div>
        );
    }

    return (
        <div>
            {/* Page Header */}
            <div style={{ marginBottom: 'var(--space-xl)' }}>
                <h1 style={{
                    fontSize: '1.5rem',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                    marginBottom: 'var(--space-xs)'
                }}>
                    User Paths
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Understand how users navigate through your site
                </p>
            </div>

            {/* Path Flow Visualization */}
            <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                padding: 'var(--space-xl)',
                marginBottom: 'var(--space-xl)'
            }}>
                <h3 style={{
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    marginBottom: 'var(--space-lg)',
                    color: 'var(--color-text-primary)'
                }}>
                    Top User Flows
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                    {data?.flows.map((path, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                            {/* From Node */}
                            <div style={{
                                padding: 'var(--space-sm) var(--space-md)',
                                background: 'var(--color-bg-tertiary)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border)',
                                minWidth: '120px',
                                textAlign: 'center',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                <span style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--color-text-secondary)',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {path.from}
                                </span>
                            </div>

                            {/* Arrow with count */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-xs)',
                                flex: 1
                            }}>
                                <div style={{
                                    flex: 1,
                                    height: '2px',
                                    background: `linear-gradient(90deg, var(--color-primary) ${path.percentage}%, var(--color-border) ${path.percentage}%)`,
                                    borderRadius: '1px'
                                }} />
                                <ArrowRight size={16} style={{ color: 'var(--color-primary)' }} />
                                <span style={{
                                    fontSize: '0.6875rem',
                                    color: 'var(--color-text-tertiary)',
                                    minWidth: '50px'
                                }}>
                                    {path.count.toLocaleString()}
                                </span>
                            </div>

                            {/* To Node */}
                            <div style={{
                                padding: 'var(--space-sm) var(--space-md)',
                                background: 'var(--color-primary-alpha)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-primary)',
                                minWidth: '150px',
                                textAlign: 'center',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                <span style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--color-primary)',
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap'
                                }}>
                                    {path.to}
                                </span>
                            </div>
                        </div>
                    ))}
                    {!data?.flows.length && (
                        <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                            Not enough path data available yet.
                        </div>
                    )}
                </div>
            </div>

            {/* Entry vs Exit Pages */}
            <div className="dash-grid-2" style={{
                gap: 'var(--space-lg)'
            }}>
                <div style={{
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)',
                    padding: 'var(--space-lg)'
                }}>
                    <h3 style={{
                        fontSize: '0.9375rem',
                        fontWeight: 500,
                        marginBottom: 'var(--space-md)',
                        color: 'var(--color-text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-xs)'
                    }}>
                        <Circle size={8} fill="var(--color-success)" stroke="none" />
                        Top Entry Pages
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                        {data?.entries.map((entry, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: 'var(--space-xs) 0',
                                borderBottom: idx < 4 ? '1px solid var(--color-border)' : 'none'
                            }}>
                                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                                    {entry.path}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                    {entry.count.toLocaleString()}
                                </span>
                            </div>
                        ))}
                        {!data?.entries.length && (
                            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>No entries yet.</span>
                        )}
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)',
                    padding: 'var(--space-lg)'
                }}>
                    <h3 style={{
                        fontSize: '0.9375rem',
                        fontWeight: 500,
                        marginBottom: 'var(--space-md)',
                        color: 'var(--color-text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-xs)'
                    }}>
                        <Circle size={8} fill="var(--color-error)" stroke="none" />
                        Top Exit Pages
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                        {data?.exits.map((exit, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: 'var(--space-xs) 0',
                                borderBottom: idx < 4 ? '1px solid var(--color-border)' : 'none'
                            }}>
                                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                                    {exit.path}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                    {exit.count.toLocaleString()}
                                </span>
                            </div>
                        ))}
                        {!data?.exits.length && (
                            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>No exits yet.</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
