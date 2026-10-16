'use client';

// Shown when the whole app fails to render, layout included, so it brings its
// own <html> and plain styles.

import { useEffect } from 'react';
import { reportError } from '@/lib/reportError';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => { reportError(error); }, [error]);

    return (
        <html lang="en">
            <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#000', color: '#f4f5f6', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                <div style={{ maxWidth: 420, textAlign: 'center', padding: 24 }}>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8 }}>Thravic hit a problem</h1>
                    <p style={{ fontSize: '0.875rem', color: '#8a8f98', marginBottom: 20 }}>
                        It has been reported. Try again in a moment.
                    </p>
                    <button
                        onClick={reset}
                        style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: '#08090a', color: '#f4f5f6', cursor: 'pointer' }}
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
