'use client';

import type { ReactNode } from 'react';
import { compactNumber } from './format';
import { formatShare } from './BarList';

export interface SplitPart {
    label: string;
    value: number;
    icon?: ReactNode;
    /** A negative answer ("No"): drawn in the soft red, not a blue shade. */
    negative?: boolean;
}

/**
 * One bar cut into parts, for a whole that splits a few ways (devices, yes or
 * no). Shades of one blue from strongest to lightest, the share printed inside
 * each part wide enough to hold it, and a column per part underneath with its
 * name and count, so nothing depends on telling shades apart.
 */
export function SplitBar({ parts, formatValue = compactNumber, emptyText = 'No data yet', stats = true }: {
    parts: SplitPart[];
    formatValue?: (value: number) => string;
    emptyText?: string;
    /** The columns under the bar. */
    stats?: boolean;
}) {
    const total = parts.reduce((sum, p) => sum + p.value, 0);
    if (total <= 0) return <div className="empty-note">{emptyText}</div>;
    // Up to three blue shades; the rest fold into the grey slot
    let shade = 0;
    const shown = parts.filter(p => p.value > 0).map(p => ({
        ...p,
        tone: p.negative ? 'neg' : `s${Math.min(shade++, 3)}`,
        share: p.value / total,
    }));

    return (
        <div>
            <div className="split-bar" role="img" aria-label={shown.map(p => `${p.label} ${formatShare(p.share)}`).join(', ')}>
                {shown.map(p => (
                    <span key={p.label} className={`split-seg ${p.tone}`} style={{ flex: `${p.share} 1 0` }} title={`${p.label}: ${formatValue(p.value)} (${formatShare(p.share)})`}>
                        {p.share >= 0.08 ? formatShare(p.share) : ''}
                    </span>
                ))}
            </div>
            {stats && (
                <div className="split-stats">
                    {shown.map(p => (
                        <div key={p.label} className="split-stat">
                            <span>
                                <i className={`split-key ${p.tone}`} aria-hidden="true" />
                                {p.icon}
                                {p.label}
                            </span>
                            <b>{formatShare(p.share)}</b>
                            <small>{formatValue(p.value)}</small>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
