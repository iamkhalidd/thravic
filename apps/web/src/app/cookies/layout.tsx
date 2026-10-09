import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

export const metadata: Metadata = pageMetadata(
    '/cookies',
    'Cookie Policy',
    'The cookies and similar technologies Thravic uses, what each one is for and how to control them.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
