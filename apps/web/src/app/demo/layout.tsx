import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

export const metadata: Metadata = pageMetadata(
    '/demo',
    'Live Demo',
    'Explore a working Thravic dashboard with sample data: traffic, session replays, heatmaps, funnels and rage clicks. No sign-up needed.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
