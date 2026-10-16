// Sends a page crash to the API, which logs it and passes it to Sentry.
// Never throws: a broken error report must not break the error page too.

const sent = new Set<string>();

export function reportError(error: Error & { digest?: string }) {
    if (typeof window === 'undefined') return;
    const key = `${error.message}|${error.digest ?? ''}`;
    if (sent.has(key)) return;
    sent.add(key);
    try {
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/client-errors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({
                app: 'web',
                message: String(error.message || 'Unknown error').slice(0, 500),
                stack: String(error.stack || '').slice(0, 4000),
                digest: error.digest,
                url: window.location.pathname,
                userAgent: navigator.userAgent.slice(0, 300),
            }),
        }).catch(() => {});
    } catch {
        // ignore
    }
}
