'use client';

/**
 * Where a value sits on a good / needs work / poor scale: three status bands
 * sized to the thresholds and a ring marker at the value. The band names are
 * printed under the bar, so the colour is never the only cue.
 */
export function VitalScale({ value, good, poor }: { value: number | null; good: number; poor: number }) {
    const max = poor * 1.6;
    const pos = (n: number) => Math.min(Math.max(n / max, 0), 1) * 100;
    const goodW = pos(good);
    const warnW = pos(poor) - goodW;
    return (
        <div className="vital-scale">
            <div className="vital-bar" aria-hidden="true">
                <span className="g" style={{ width: `${goodW}%` }} />
                <span className="w" style={{ width: `${warnW}%` }} />
                <span className="p" style={{ flex: 1 }} />
                {value !== null && Number.isFinite(value) && <span className="vital-marker" style={{ left: `${pos(value)}%` }} />}
            </div>
            <div className="vital-labels" aria-hidden="true">
                <span style={{ width: `${goodW}%` }}>Good</span>
                <span style={{ width: `${warnW}%` }}>Needs work</span>
                <span style={{ flex: 1 }}>Poor</span>
            </div>
        </div>
    );
}
