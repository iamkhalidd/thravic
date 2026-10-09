import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

export const metadata: Metadata = pageMetadata(
    '/privacy',
    'Privacy Policy',
    'How Thravic collects, processes and protects data, including our data processing agreement for customers.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
