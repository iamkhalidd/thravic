import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { ToastProvider, RouteErrorBoundary } from '@/components';
import CookieConsentBanner from '@/components/CookieConsentBanner';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ALLOW_INDEXING, SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_URL } from '@/lib/site';

const DEFAULT_TITLE = 'Thravic: Session Replays, Heatmaps & Funnel Analytics';

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: { default: DEFAULT_TITLE, template: '%s · Thravic' },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    keywords: SITE_KEYWORDS,
    authors: [{ name: SITE_NAME, url: SITE_URL }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: 'technology',
    alternates: { canonical: '/' },
    openGraph: {
        type: 'website',
        siteName: SITE_NAME,
        locale: 'en_US',
        url: '/',
        title: DEFAULT_TITLE,
        description: SITE_DESCRIPTION,
    },
    twitter: {
        card: 'summary_large_image',
        title: DEFAULT_TITLE,
        description: SITE_DESCRIPTION,
    },
    robots: ALLOW_INDEXING
        ? {
              index: true,
              follow: true,
              googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
          }
        : { index: false, follow: false },
    // Paste the tokens from Google Search Console / Bing Webmaster Tools once
    // the domain is verified there (HTML tag method).
    verification: {
        google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
        other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
            ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
            : undefined,
    },
};

export const viewport: Viewport = {
    themeColor: [
        { media: '(prefers-color-scheme: dark)', color: '#000000' },
        { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    ],
};

// Structured data so search engines understand what Thravic is: the company,
// the site (with its name for sitelinks) and the product itself.
const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
        {
            '@type': 'Organization',
            '@id': `${SITE_URL}/#organization`,
            name: SITE_NAME,
            url: SITE_URL,
            logo: `${SITE_URL}/thravic-logo-light.png`,
        },
        {
            '@type': 'WebSite',
            '@id': `${SITE_URL}/#website`,
            name: SITE_NAME,
            url: SITE_URL,
            description: SITE_DESCRIPTION,
            publisher: { '@id': `${SITE_URL}/#organization` },
            inLanguage: 'en',
        },
        {
            '@type': 'SoftwareApplication',
            '@id': `${SITE_URL}/#software`,
            name: SITE_NAME,
            url: SITE_URL,
            description: SITE_DESCRIPTION,
            applicationCategory: 'BusinessApplication',
            applicationSubCategory: 'Web analytics',
            operatingSystem: 'Web',
            featureList: [
                'Session replay',
                'Heatmaps',
                'Conversion funnels',
                'Rage click detection',
                'Traffic sources',
                'Form analytics',
                'Web performance monitoring',
                'AI insights',
            ],
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free plan available' },
            publisher: { '@id': `${SITE_URL}/#organization` },
        },
    ],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" data-theme="dark" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
                    rel="stylesheet"
                />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
                />
            </head>
            <body>
                <ThemeProvider attribute="data-theme" defaultTheme="dark">
                    <ToastProvider>
                        <RouteErrorBoundary>
                            {children}
                        </RouteErrorBoundary>
                    </ToastProvider>
                    <CookieConsentBanner />
                </ThemeProvider>
            </body>
        </html>
    );
}


