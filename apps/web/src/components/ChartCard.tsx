'use client';

import type { ReactNode } from 'react';
import { InfoTip } from './InfoTip';

/**
 * A card with a title row (and optional action) around a chart or list. The
 * summary is one plain sentence saying what the chart shows; `info` explains
 * the metric behind an ⓘ.
 */
export function ChartCard({ title, subtitle, info, summary, action, children, loading, height = 240, flush }: {
    title: ReactNode;
    subtitle?: ReactNode;
    info?: string;
    summary?: ReactNode;
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
                    <h2 className="card-title">{title}{info && <InfoTip text={info} />}</h2>
                    {subtitle && <p className="card-subtitle">{subtitle}</p>}
                </div>
                {action}
            </div>
            {loading
                ? <div className="skeleton" style={{ height, margin: flush ? '0 20px 20px' : 0 }} />
                : (
                    <>
                        {summary && <p className="chart-summary" style={flush ? { padding: '0 20px' } : undefined}>{summary}</p>}
                        {children}
                    </>
                )}
        </section>
    );
}
