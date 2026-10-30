'use client';

import { Info } from 'lucide-react';

/** A small ⓘ that explains a term in one sentence on hover or keyboard focus. */
export function InfoTip({ text }: { text: string }) {
    return (
        <button type="button" className="info-tip" aria-label={text}>
            <Info size={13} aria-hidden="true" />
            <span role="tooltip">{text}</span>
        </button>
    );
}
