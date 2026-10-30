'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { compactNumber, inEvery } from './format';
import { ChangeBadge } from '../ChangeBadge';

export interface BarListItem {
    label: string;
    value: number;
    /** Leading icon or favicon. */
    icon?: ReactNode;
    href?: string;
    /** Secondary text after the label (e.g. a medium). */
    detail?: string;
    /** Value in the previous period; set when Compare is on, adds a change badge. */
    previous?: number;
}

/**
 * A ranked list: each row is the label over a thin bar sized to the largest
 * value, with the value and its share of the total on the right. The readable
 * form for "which parts are biggest" (sources, pages, versions), where a donut
 * makes people compare angles. One hue only: the label names the item, so
 * color carries no identity here; the leader is full strength, the rest
 * lighter. Labels and values stay in text ink.
 */
export function BarList({
    items, labelHeader, valueHeader, limit = 8, formatValue = compactNumber, showShare = true, emptyText = 'No data yet', footer,
}: {
    items: BarListItem[];
    labelHeader?: string;
    valueHeader?: string;
    limit?: number;
    formatValue?: (value: number) => string;
    /** "N% of all" under each value. */
    showShare?: boolean;
    emptyText?: string;
    /** One line under the list, e.g. what clicking a row does. */
    footer?: ReactNode;
}) {
    const rows = [...items].sort((a, b) => b.value - a.value).slice(0, limit);
    const max = Math.max(...rows.map(r => r.value), 0);
    const total = items.reduce((sum, r) => sum + r.value, 0);
    // Comparing when any row carries a previous value; rows without one had none
    const comparing = items.some(r => r.previous !== undefined);

    if (!rows.length || max === 0) return <div className="empty-note">{emptyText}</div>;

    return (
        <div>
            {(labelHeader || valueHeader) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)', paddingBottom: 8 }}>
                    <span>{labelHeader}</span>
                    <span>{valueHeader}</span>
                </div>
            )}
            <ul className="rank-list">
                {rows.map(row => {
                    const width = `${Math.max((row.value / max) * 100, 2)}%`;
                    const isNew = comparing && !row.previous && row.value > 0;
                    const labelInner = (
                        <>
                            <span className="rank-name" title={row.label}>{row.label}</span>
                            {row.detail && <span className="rank-detail">{row.detail}</span>}
                            {isNew && <span className="chip">New</span>}
                        </>
                    );
                    return (
                        <li key={row.label} className="rank-row">
                            {row.icon && <span className="rank-icon" aria-hidden="true">{row.icon}</span>}
                            <span className="rank-body">
                                {row.href
                                    ? <Link href={row.href} className="rank-label">{labelInner}</Link>
                                    : <span className="rank-label">{labelInner}</span>}
                                <span className="rank-track" aria-hidden="true"><span className="rank-fill" style={{ display: 'block', width }} /></span>
                            </span>
                            <span className="rank-value">
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {comparing && !isNew && <ChangeBadge now={row.value} before={row.previous ?? 0} />}
                                    <b>{formatValue(row.value)}</b>
                                </span>
                                {showShare && total > 0 && <small>{formatShare(row.value / total)} of all</small>}
                            </span>
                        </li>
                    );
                })}
            </ul>
            {footer && <div className="chart-foot">{footer}</div>}
        </div>
    );
}

/** 0.004 -> "<1%", 0.256 -> "26%". */
export function formatShare(fraction: number): string {
    if (fraction <= 0) return '0%';
    if (fraction < 0.01) return '<1%';
    return `${Math.round(fraction * 100)}%`;
}

/** "Organic search brought 2 in every 5 sessions." for the top row, or null. */
export function leaderSummary(items: BarListItem[], verb: string, noun: string): ReactNode {
    const total = items.reduce((sum, r) => sum + r.value, 0);
    const top = [...items].sort((a, b) => b.value - a.value)[0];
    if (!top || total <= 0 || top.value <= 0) return null;
    return <><strong>{top.label}</strong> {verb} <strong>{inEvery(top.value / total)}</strong> {noun}.</>;
}

