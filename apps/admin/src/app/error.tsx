'use client';

// Shown when a page crashes. The crash is reported so it can be fixed without
// waiting for someone to tell us.

import { useEffect } from 'react';
import { reportError } from '@/lib/reportError';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => { reportError(error); }, [error]);

    return (
        <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24 }}>
            <div style={{ maxWidth: 420, textAlign: 'center' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8, color: 'var(--color-text-primary)' }}>
                    Something went wrong on this page
                </h1>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 20 }}>
                    It has been reported. Try again, and if it keeps happening, reload the page.
                </p>
                <button
                    onClick={reset}
                    style={{
                        padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: '0.875rem',
                    }}
                >
                    Try again
                </button>
            </div>
        </div>
    );
}
