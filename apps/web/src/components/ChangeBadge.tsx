import { TrendingDown, TrendingUp } from 'lucide-react';

/** Percentage change, or undefined without a previous value to compare with. */
export function percentChange(now?: number, before?: number): number | undefined {
    if (now === undefined || before === undefined || before === 0) return undefined;
    return ((now - before) / before) * 100;
}

/**
 * Change against the previous period, for table rows and list items. Shows
 * "New" when something had nothing before, and nothing when both are zero.
 */
export function ChangeBadge({ now, before, lowerIsBetter }: { now: number; before?: number; lowerIsBetter?: boolean }) {
    if (before === undefined || (before === 0 && now === 0)) return null;
    if (before === 0) {
        return <span className={`stat-change ${lowerIsBetter ? 'negative' : 'positive'}`} title="None in the previous period">New</span>;
    }
    const change = percentChange(now, before)!;
    const good = lowerIsBetter ? change <= 0 : change >= 0;
    return (
        <span className={`stat-change ${good ? 'positive' : 'negative'}`} title={`${before.toLocaleString()} in the previous period`}>
            {change >= 0 ? <TrendingUp size={11} aria-hidden="true" /> : <TrendingDown size={11} aria-hidden="true" />}
            {change >= 0 ? '+' : '−'}{Math.abs(change).toFixed(0)}%
        </span>
    );
}
