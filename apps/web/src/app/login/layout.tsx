import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

export const metadata: Metadata = pageMetadata('/login', 'Log in', 'Log in to your Thravic analytics dashboard.');

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
