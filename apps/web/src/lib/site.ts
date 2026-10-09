import type { Metadata } from 'next';

// Public facts about the marketing site, shared by metadata, robots.txt,
// sitemap.xml and the structured data in the root layout.
//
// SITE_URL resolves in this order:
//   1. NEXT_PUBLIC_SITE_URL (set this to the custom domain once it is live)
//   2. the Vercel production URL, so canonicals point somewhere real until then
//   3. localhost for development

function resolveSiteUrl(): string {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL;
    if (explicit) return explicit.replace(/\/+$/, '');
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (vercel) return `https://${vercel}`;
    return 'http://localhost:3000';
}

export const SITE_URL = resolveSiteUrl();

export const SITE_NAME = 'Thravic';

export const SITE_DESCRIPTION =
    'Thravic shows why visitors leave your site. Session replays, heatmaps, conversion funnels ' +
    'and traffic analytics from one ~6 KB script, with form inputs masked in every replay.';

export const SITE_KEYWORDS = [
    'website analytics',
    'session replay',
    'session recording',
    'heatmaps',
    'conversion funnels',
    'funnel analysis',
    'rage clicks',
    'traffic analytics',
    'web analytics',
    'privacy-friendly analytics',
    'user behavior analytics',
    'Hotjar alternative',
];

// Only production should be indexed. Vercel preview deployments and local
// builds send noindex so duplicate copies of the site never reach search.
export const ALLOW_INDEXING =
    process.env.NEXT_PUBLIC_ALLOW_INDEXING === 'true' ||
    (process.env.VERCEL_ENV ? process.env.VERCEL_ENV === 'production' : process.env.NODE_ENV === 'production');

// Public, indexable routes. Keep in sync with the app directory.
export const PUBLIC_ROUTES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/demo', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/contact', priority: 0.6, changeFrequency: 'yearly' },
    { path: '/register', priority: 0.6, changeFrequency: 'yearly' },
    { path: '/login', priority: 0.4, changeFrequency: 'yearly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/cookies', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/gdpr', priority: 0.3, changeFrequency: 'yearly' },
];

// Signed-in areas that crawlers should not even fetch. One-off flows such as
// password reset stay crawlable so search engines can read their noindex tag.
export const PRIVATE_PATHS = ['/dashboard', '/auth'];

// Metadata for one public page: its own title, description and canonical URL,
// mirrored into the Open Graph and Twitter cards. Next replaces these objects
// rather than merging them with the root layout's, so repeat the shared fields.
export function pageMetadata(path: string, title: string, description: string): Metadata {
    const fullTitle = `${title} · ${SITE_NAME}`;
    return {
        title,
        description,
        alternates: { canonical: path },
        openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_US', url: path, title: fullTitle, description },
        twitter: { card: 'summary_large_image', title: fullTitle, description },
    };
}

// For pages that exist for signed-out flows but have no value in search.
export const NOINDEX: Metadata = { robots: { index: false, follow: true } };
