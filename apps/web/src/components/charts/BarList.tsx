'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { compactNumber } from './format';

export interface BarListItem {
    label: string;
    value: number;
    /** Leading icon or favicon. */
    icon?: ReactNode;
    href?: string;
    /** Secondary text after the label (e.g. a medium). */
    detail?: string;
}

/**
 * A ranked list with a bar behind each row, sized to the largest value: the
 * readable form for "which parts are biggest" (sources, pages, devices), where
 * a donut makes people compare angles. One hue only: the label names the item,
 * so color carries no identity here. Labels and values stay in text ink.
 */
export function BarList({
    items, labelHeader, valueHeader, limit = 8, formatValue = compactNumber, showShare = true, emptyText = 'No data yet',
}: {
    items: BarListItem[];
    labelHeader?: string;
    valueHeader?: string;
    limit?: number;
    formatValue?: (value: number) => string;
    /** Percentage of the total after each value. */
    showShare?: boolean;
    emptyText?: string;
}) {
    const rows = [...items].sort((a, b) => b.value - a.value).slice(0, limit);
    const max = Math.max(...rows.map(r => r.value), 0);
    const total = items.reduce((sum, r) => sum + r.value, 0);

    if (!rows.length || max === 0) return <div className="empty-note">{emptyText}</div>;

    return (
        <div>
            {(labelHeader || valueHeader) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)', padding: '0 8px 6px' }}>
                    <span>{labelHeader}</span>
                    <span>{valueHeader}</span>
                </div>
            )}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {rows.map(row => {
                    const width = `${Math.max((row.value / max) * 100, 1.5)}%`;
                    const label = (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, position: 'relative' }}>
                            {row.icon && <span aria-hidden="true" style={{ display: 'flex', color: 'var(--color-text-secondary)', flexShrink: 0 }}>{row.icon}</span>}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.label}>{row.label}</span>
                            {row.detail && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{row.detail}</span>}
                        </span>
                    );
                    return (
                        <li key={row.label} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 30, padding: '0 8px', fontSize: '0.8125rem' }}>
                            <span aria-hidden="true" style={{ position: 'absolute', inset: '0 auto 0 0', width, background: 'var(--chart-bar)', borderRadius: 4 }} />
                            {row.href ? <Link href={row.href} style={{ color: 'var(--color-text-primary)', textDecoration: 'none', minWidth: 0 }}>{label}</Link> : label}
                            <span style={{ position: 'relative', display: 'flex', gap: 8, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{formatValue(row.value)}</span>
                                {showShare && total > 0 && (
                                    <span style={{ color: 'var(--color-text-muted)', minWidth: '3.2em', textAlign: 'right' }}>
                                        {formatShare(row.value / total)}
                                    </span>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** 0.004 -> "<1%", 0.256 -> "26%". */
export function formatShare(fraction: number): string {
    if (fraction <= 0) return '0%';
    if (fraction < 0.01) return '<1%';
    return `${Math.round(fraction * 100)}%`;
}
