// Shared look for the public docs pages (matches /docs/react-native).
export const docs = {
    page: { minHeight: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', padding: '80px 16px' },
    container: { maxWidth: '760px', margin: '0 auto' },
    back: {
        display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)',
        textDecoration: 'none', fontSize: '0.875rem', marginBottom: 40,
    },
    h1: { fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 600, letterSpacing: '-0.03em', margin: '0 0 16px' },
    lead: { fontSize: '1.125rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 48px' },
    h2: { fontSize: '1.5rem', fontWeight: 600, margin: '56px 0 16px' },
    p: { fontSize: '1rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, margin: '0 0 16px' },
    pre: {
        background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
        padding: '14px 16px', margin: '0 0 16px', overflowX: 'auto' as const, fontSize: '0.8125rem',
        fontFamily: 'var(--font-mono)', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
    },
    li: { fontSize: '1rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 8 },
    link: { color: 'var(--color-accent-primary)' },
};

// Example tag for the public guides; the dashboard shows the same tag with the site's own ID.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
export const EXAMPLE_SCRIPT = `<script async src="${API_URL}/tf.js" data-tracking-id="TF-1A2B3C4D"></script>`;
