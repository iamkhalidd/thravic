import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

export const metadata: Metadata = pageMetadata(
    '/register',
    'Create your free account',
    'Start with Thravic for free. Add one script tag and see session replays, heatmaps and funnels for your site within minutes.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
