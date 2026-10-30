'use client';

import { Fragment } from 'react';
import { compactNumber } from './format';

export interface FunnelStep {
    id: string;
    name: string;
    visitors: number;
}

/**
 * A funnel as columns: each step's column is its share of the people who
 * started, fading step by step, with the count and "% of start" on it. Between
 * steps a chip says how many left there; the biggest drop is red, so the step
 * to fix first stands out.
 */
export function FunnelColumns({ steps }: { steps: FunnelStep[] }) {
    const first = steps[0]?.visitors ?? 0;
    if (!steps.length || first <= 0) return <div className="empty-note">Nobody started this funnel in this period.</div>;

    const drops = steps.slice(1).map((step, i) => {
        const before = steps[i].visitors;
        return before > 0 ? (before - step.visitors) / before : 0;
    });
    const biggest = drops.length ? drops.indexOf(Math.max(...drops)) : -1;
    const fade = (i: number) => steps.length > 1 ? 1 - (i / (steps.length - 1)) * 0.4 : 1;

    return (
        <div className="funnel-cols">
            {steps.map((step, i) => {
                const share = step.visitors / first;
                const height = Math.max(share * 100, 2);
                // Labels sit inside a column tall enough to hold them, above it otherwise
                const inside = height >= 28;
                return (
                    <Fragment key={step.id}>
                        {i > 0 && (
                            <div className="funnel-gap">
                                <span className={`chip${i - 1 === biggest && drops[i - 1] > 0 ? ' bad' : ''}`}
                                    title={`${(steps[i - 1].visitors - step.visitors).toLocaleString()} people left between these steps`}>
                                    −{Math.round(drops[i - 1] * 100)}% left
                                </span>
                                {i - 1 === biggest && drops[i - 1] > 0 && <small>biggest drop</small>}
                            </div>
                        )}
                        <div className="funnel-col">
                            <div className="funnel-track">
                                <div className="funnel-fill" style={{ height: `${height}%`, opacity: fade(i) }} />
                                <div className={`funnel-label${inside ? ' inside' : ''}`}
                                    style={inside ? { top: `calc(${100 - height}% + 10px)` } : { bottom: `calc(${height}% + 8px)` }}>
                                    <b>{compactNumber(step.visitors)}</b>
                                    <small>{i === 0 ? 'started' : `${Math.round(share * 100)}% of start`}</small>
                                </div>
                            </div>
                            <div className="funnel-name" title={step.name}><span>{i + 1}</span>{step.name}</div>
                        </div>
                    </Fragment>
                );
            })}
        </div>
    );
}
