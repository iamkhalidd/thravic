import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

export const metadata: Metadata = pageMetadata(
    '/about',
    'About',
    'Why we built Thravic: behavior analytics that shows where and why visitors drop off, without collecting what they type.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
