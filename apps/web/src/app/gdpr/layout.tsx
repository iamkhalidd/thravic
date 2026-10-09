import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

export const metadata: Metadata = pageMetadata(
    '/gdpr',
    'GDPR Compliance',
    'How Thravic supports GDPR: our role as processor, data subject rights, sub-processors and international transfers.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
