import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
    title: 'Thravic Admin',
    description: 'Thravic Analytics Admin Panel',
};

// Applies the saved theme before the first paint, so a light-mode visit never flashes dark.
const themeScript = `try{if(localStorage.getItem('thravic-admin-theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" data-theme="dark" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
                />
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
            </head>
            <body>{children}</body>
        </html>
    );
}
