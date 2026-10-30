/** 1,234 -> "1.2k", 2,500,000 -> "2.5M"; small numbers unchanged. */
export function compactNumber(value: number): string {
    if (!Number.isFinite(value)) return '0';
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`;
    return Math.round(value).toLocaleString();
}

/** "2026-10-05" (or a Date/ISO string) -> "Oct 5". */
export function shortDay(value: string | number | Date): string {
    const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00Z`)
        : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Seconds -> "1m 05s" / "42s". */
export function duration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

/** 0.4 -> "2 in every 5", 0.62 -> "6 in 10": a share people can picture. */
export function inEvery(fraction: number): string {
    if (!Number.isFinite(fraction) || fraction <= 0) return 'none';
    if (fraction >= 0.97) return 'almost all';
    if (fraction < 0.1) return `${Math.max(1, Math.round(fraction * 100))} in 100`;
    for (const d of [2, 3, 4, 5]) {
        const n = Math.round(fraction * d);
        if (n > 0 && n < d && Math.abs(n / d - fraction) <= 0.03) return n === 1 && d === 2 ? '1 in 2' : `${n} in every ${d}`;
    }
    return `${Math.round(fraction * 10)} in 10`;
}

/** 14.2 -> "14% more than", -3 -> "3% fewer than", 0.2 -> "about the same as". */
export function changeWords(pct: number, words: [string, string] = ['more', 'fewer']): string {
    const rounded = Math.round(Math.abs(pct));
    if (rounded === 0) return 'about the same as';
    return `${rounded}% ${pct > 0 ? words[0] : words[1]} than`;
}
