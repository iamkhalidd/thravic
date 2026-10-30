'use client';

import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { InfoTip } from './InfoTip';

interface StatCardProps {
    label: string;
    value: ReactNode;
    /** Percentage change against the previous period. */
    change?: number;
    /** Some metrics are better when they go down (bounce rate, load time). */
    lowerIsBetter?: boolean;
    /** One short line under the value (e.g. "of all visits", "Good: < 2.5s"). */
    hint?: ReactNode;
    /** One sentence explaining the metric, behind an ⓘ. */
    info?: string;
    icon?: LucideIcon;
    /** Small colored dot before the label, for an entity that has a color elsewhere. */
    dot?: string;
    loading?: boolean;
    /** Makes the tile a toggle (e.g. picks the metric a chart shows). */
    onSelect?: () => void;
    selected?: boolean;
}

/** ↑ 14% in green when the change is good, red when it is bad. */
export function ChangeChip({ change, lowerIsBetter }: { change: number; lowerIsBetter?: boolean }) {
    if (!Number.isFinite(change)) return null;
    const rounded = Math.abs(change) < 10 ? Math.abs(change).toFixed(1) : Math.round(Math.abs(change)).toString();
    if (Number(rounded) === 0) return <span className="change-chip flat">0%</span>;
    const good = lowerIsBetter ? change < 0 : change > 0;
    const Arrow = change > 0 ? ArrowUp : ArrowDown;
    return (
        <span className={`change-chip ${good ? 'good' : 'bad'}`}>
            <Arrow size={11} strokeWidth={2.5} aria-hidden="true" />
            <span className="sr-only">{change > 0 ? 'Up' : 'Down'} </span>
            {rounded}%
        </span>
    );
}

/** One stat tile for every page: label, value, optional change and hint. */
export function StatCard({ label, value, change, lowerIsBetter, hint, info, icon: Icon, dot, loading, onSelect, selected }: StatCardProps) {
    if (loading) {
        return (
            <div className="card stat-card" aria-busy="true">
                <div className="skeleton" style={{ width: '50%', height: '12px' }} />
                <div className="skeleton" style={{ width: '40%', height: '26px' }} />
            </div>
        );
    }
    const hasChange = change !== undefined && Number.isFinite(change);
    const body = (
        <>
            <span className="stat-label">
                {Icon && <Icon size={14} aria-hidden="true" style={{ color: 'var(--color-text-muted)' }} />}
                {dot && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />}
                {label}
                {info && !onSelect && <InfoTip text={info} />}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="stat-value">{value}</span>
                {hasChange && <ChangeChip change={change} lowerIsBetter={lowerIsBetter} />}
            </span>
            {hint && <span className="stat-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{hint}</span>}
        </>
    );
    if (onSelect) {
        return (
            <button type="button" className="card stat-card" aria-pressed={!!selected} onClick={onSelect} title={info}>
                {body}
            </button>
        );
    }
    return <div className="card stat-card">{body}</div>;
}
