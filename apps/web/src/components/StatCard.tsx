'use client';

import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
    label: string;
    value: ReactNode;
    /** Percentage change against the previous period. */
    change?: number;
    /** Some metrics are better when they go down (bounce rate, load time). */
    lowerIsBetter?: boolean;
    /** One short line under the value (e.g. "of all visits", "Good: < 2.5s"). */
    hint?: ReactNode;
    icon?: LucideIcon;
    /** Small colored dot before the label, for an entity that has a color elsewhere. */
    dot?: string;
    loading?: boolean;
}

/** One stat tile for every page: label, value, optional change and hint. */
export function StatCard({ label, value, change, lowerIsBetter, hint, icon: Icon, dot, loading }: StatCardProps) {
    if (loading) {
        return (
            <div className="card stat-card" aria-busy="true">
                <div className="skeleton" style={{ width: '50%', height: '12px' }} />
                <div className="skeleton" style={{ width: '40%', height: '26px' }} />
            </div>
        );
    }
    const good = change !== undefined && (lowerIsBetter ? change <= 0 : change >= 0);
    return (
        <div className="card stat-card">
            <span className="stat-label">
                {Icon && <Icon size={14} aria-hidden="true" style={{ color: 'var(--color-text-muted)' }} />}
                {dot && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />}
                {label}
            </span>
            <span className="stat-value">{value}</span>
            {(change !== undefined || hint) && (
                <span className="stat-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {change !== undefined && Number.isFinite(change) && (
                        <span className={`stat-change ${good ? 'positive' : 'negative'}`}>
                            {change >= 0 ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
                            {change >= 0 ? '+' : '−'}{Math.abs(change).toFixed(1)}%
                        </span>
                    )}
                    {hint}
                </span>
            )}
        </div>
    );
}
