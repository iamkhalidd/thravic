import type { Metadata } from 'next';
import '@/styles/globals.css';
import { ToastProvider, RouteErrorBoundary } from '@/components';
import CookieConsentBanner from '@/components/CookieConsentBanner';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata: Metadata = {
    title: 'Thravic - Traffic Intelligence & Analytics',
    description: 'Comprehensive analytics platform for tracking traffic, user behavior, funnels, heatmaps, and AI-powered insights.',
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


