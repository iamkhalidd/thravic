import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { pageMetadata } from '@/lib/site';
import CompareTable from '../landing/CompareTable';
import { docs } from '../docs/docsStyles';

export const metadata: Metadata = pageMetadata(
    '/compare',
    'Thravic vs Microsoft Clarity, Hotjar and Google Analytics',
    'How Thravic compares with Microsoft Clarity, Hotjar and Google Analytics 4 on session replays, heatmaps, funnels, cookies and price.',
);

export default function ComparePage() {
    return (
        <div style={docs.page}>
            <div style={{ ...docs.container, maxWidth: '920px' }}>
                <Link href="/" style={docs.back}><ArrowLeft size={16} /> Back to Home</Link>

                <h1 style={docs.h1}>Thravic, Clarity, Hotjar and Google Analytics</h1>
                <p style={docs.lead}>
                    Clarity, Hotjar and Google Analytics each cover part of the picture. Thravic puts it in one place,
                    priced for you.
                </p>

                <CompareTable />

                <div style={{ maxWidth: '760px' }}>
                    <h2 style={docs.h2}>Why teams pick Thravic</h2>
                    <ul style={{ paddingLeft: 20, margin: 0 }}>
                        <li style={docs.li}>
                            <strong>Instead of Microsoft Clarity:</strong> Clarity is free, but it sets cookies, so in many
                            places it needs a consent banner before it records anything. Thravic sets no cookies, masks every
                            form input, and adds traffic sources, UTM campaigns and Core Web Vitals in the same dashboard.
                        </li>
                        <li style={docs.li}>
                            <strong>Instead of Google Analytics 4:</strong> GA4 tells you where visitors came from, but not
                            what they did on the page. It has no replays and no heatmaps, so you need a second tool. Thravic
                            shows both in one place.
                        </li>
                        <li style={docs.li}>
                            <strong>Instead of Hotjar:</strong> Hotjar is priced in US dollars and needs a card that works
                            abroad. Thravic is priced in naira through Paystack, and paid plans never auto-renew.
                        </li>
                        <li style={docs.li}>
                            <strong>Only Thravic:</strong> a daily AI summary of what changed, with suggested fixes, and your
                            React Native and Expo apps in the same dashboard as your website.
                        </li>
                    </ul>

                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20, marginTop: 48 }}>
                        <Link href="/register" style={{
                            background: 'var(--color-accent-primary)', color: 'var(--color-bg-primary)',
                            padding: '12px 28px', borderRadius: '999px', textDecoration: 'none',
                            fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8,
                        }}>
                            Start free <ArrowRight size={18} />
                        </Link>
                        <Link href="/demo" style={docs.link}>Or open the live demo</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
