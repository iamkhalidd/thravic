'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
    label: string;
    value: string | number;
    change?: number;           // percentage change
    icon?: LucideIcon;
    loading?: boolean;
    format?: 'number' | 'percent' | 'duration' | 'raw';
}

function formatValue(value: string | number, format?: string): string {
    if (typeof value === 'string') return value;
    switch (format) {
        case 'percent':
            return `${value.toFixed(1)}%`;
        case 'duration': {
            const mins = Math.floor(value / 60);
            const secs = Math.floor(value % 60);
            return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        }
        case 'number':
            return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString();
        default:
            return String(value);
    }
}

export function StatCard({ label, value, change, icon: Icon, loading, format }: StatCardProps) {
    if (loading) {
        return (
            <div className="card stat-card" style={{ minHeight: '120px' }}>
                <div className="skeleton" style={{ width: '60%', height: '14px', marginBottom: '8px' }} />
                <div className="skeleton" style={{ width: '40%', height: '32px', marginBottom: '8px' }} />
                <div className="skeleton" style={{ width: '30%', height: '12px' }} />
            </div>
        );
    }

    return (
        <div className="card stat-card">
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-xs)'
            }}>
                <span className="stat-label">{label}</span>
                {Icon && (
                    <Icon size={18} style={{ color: 'var(--color-text-muted)' }} />
                )}
            </div>
            <span className="stat-value">{formatValue(value, format)}</span>
            {change !== undefined && (
                <span className={`stat-change ${change >= 0 ? 'positive' : 'negative'}`}>
                    {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {Math.abs(change).toFixed(1)}%
                </span>
            )}
        </div>
    );
}
