'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ErrorBoundary } from './ErrorBoundary';

/** An error boundary that resets when the route changes. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}
