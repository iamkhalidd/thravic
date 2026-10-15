import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

export const metadata: Metadata = pageMetadata(
    '/cookies',
    'Cookie Policy',
    'Thravic uses no cookies. The small values it keeps in browser storage, what each one is for and how to clear them.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
