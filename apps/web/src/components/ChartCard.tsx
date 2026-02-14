'use client';

import type { ReactNode } from 'react';

interface ChartCardProps {
    title: string;
    action?: ReactNode;
    children: ReactNode;
    loading?: boolean;
    minHeight?: string;
}

export function ChartCard({ title, action, children, loading, minHeight = '300px' }: ChartCardProps) {
    return (
        <div className="card" style={{ minHeight }}>
            <div className="card-header">
                <h4 className="card-title">{title}</h4>
                {action}
            </div>
            {loading ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-sm)',
                    padding: 'var(--space-md) 0'
                }}>
                    <div className="skeleton" style={{ width: '100%', height: '200px' }} />
                </div>
            ) : (
                children
            )}
        </div>
    );
}
