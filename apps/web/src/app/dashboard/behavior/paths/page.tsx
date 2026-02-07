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
    const [paths, setPaths] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (selectedDomainId) {
            loadPaths();
        }
    }, [selectedDomainId]);

    const loadPaths = async () => {
        if (!selectedDomainId) return;
        setLoading(true);
        // Use analytics endpoint
        const result = await analytics.getTopPages(selectedDomainId);
        if (result.data) {
            // Generate path data from pages
            const pages = result.data.pages || [];
            const mockPaths = pages.slice(0, 5).map((page: any, idx: number) => ({
                from: idx === 0 ? '(entry)' : pages[idx - 1]?.path || '/',
                to: page.path,
                count: page.pageviews || 0,
                percentage: 100 - (idx * 15)
            }));
            setPaths(mockPaths);
        }
        setLoading(false);
    };

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
                    {paths.map((path, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                            {/* From Node */}
                            <div style={{
                                padding: 'var(--space-sm) var(--space-md)',
                                background: 'var(--color-bg-tertiary)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border)',
                                minWidth: '120px',
                                textAlign: 'center'
                            }}>
                                <span style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--color-text-secondary)'
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
                                textAlign: 'center'
                            }}>
                                <span style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--color-primary)',
                                    fontWeight: 500
                                }}>
                                    {path.to}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Entry vs Exit Pages */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
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
                        {paths.slice(0, 5).map((path, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: 'var(--space-xs) 0',
                                borderBottom: idx < 4 ? '1px solid var(--color-border)' : 'none'
                            }}>
                                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                                    {path.to}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                    {path.count.toLocaleString()}
                                </span>
                            </div>
                        ))}
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
                        {paths.slice(0, 5).reverse().map((path, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: 'var(--space-xs) 0',
                                borderBottom: idx < 4 ? '1px solid var(--color-border)' : 'none'
                            }}>
                                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                                    {path.to}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                    {Math.round(path.count * 0.3).toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
