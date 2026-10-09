import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

export const metadata: Metadata = pageMetadata(
    '/contact',
    'Contact',
    'Questions about Thravic, pricing, data processing or a custom plan? Send the team a message and we will get back to you.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
