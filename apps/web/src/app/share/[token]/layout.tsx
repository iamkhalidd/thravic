import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// A client link is private: never indexed, and no referrer leaks the token to
// sites the page links to.
export const metadata: Metadata = {
    title: { absolute: 'Website report' },
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
};

export default function ShareLayout({ children }: { children: ReactNode }) {
    return children;
}
