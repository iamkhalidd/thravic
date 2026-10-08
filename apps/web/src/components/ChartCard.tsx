'use client';

import type { ReactNode } from 'react';

/** A card with a title row (and optional action) around a chart or list. */
export function ChartCard({ title, subtitle, action, children, loading, height = 240, flush }: {
    title: ReactNode;
    subtitle?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
    loading?: boolean;
    /** Skeleton height while loading. */
    height?: number;
    /** Content runs edge to edge (tables). */
    flush?: boolean;
}) {
    return (
        <section className={`card${flush ? ' card-flush' : ''}`} style={{ minWidth: 0 }}>
            <div className="card-header">
                <div style={{ minWidth: 0 }}>
                    <h2 className="card-title">{title}</h2>
                    {subtitle && <p className="card-subtitle">{subtitle}</p>}
                </div>
                {action}
            </div>
            {loading
                ? <div className="skeleton" style={{ height, margin: flush ? '0 20px 20px' : 0 }} />
                : children}
        </section>
    );
}
