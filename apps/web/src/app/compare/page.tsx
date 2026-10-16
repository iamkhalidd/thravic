import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
                    All four are good tools. This page sets out what each one does so you can pick the one that fits,
                    even if that isn&apos;t us.
                </p>

                <CompareTable />

                <div style={{ maxWidth: '760px' }}>
                    <h2 style={docs.h2}>When another tool is the better fit</h2>
                    <ul style={{ paddingLeft: 20, margin: 0 }}>
                        <li style={docs.li}>
                            <strong>Microsoft Clarity</strong> is free, with replays and heatmaps. If cost is the deciding factor
                            and you&apos;re comfortable with its cookies, it&apos;s a strong choice.
                        </li>
                        <li style={docs.li}>
                            <strong>Google Analytics 4</strong> is free and goes deep on traffic and advertising, especially
                            alongside Google Ads. It doesn&apos;t show replays or heatmaps.
                        </li>
                        <li style={docs.li}>
                            <strong>Hotjar</strong> adds surveys and feedback widgets to replays and heatmaps, priced in US dollars.
                        </li>
                    </ul>

                    <h2 style={docs.h2}>Where Thravic fits</h2>
                    <ul style={{ paddingLeft: 20, margin: 0 }}>
                        <li style={docs.li}>
                            Replays, heatmaps, funnels and traffic analytics (sources, UTM campaigns, pages, errors and
                            Core Web Vitals) in one dashboard, from one ~6 KB script.
                        </li>
                        <li style={docs.li}>
                            No cookies. Every form input is masked in the browser, Do Not Track and Global Privacy Control are
                            honored, and consent mode can hold tracking until a visitor opts in.
                        </li>
                        <li style={docs.li}>A daily AI read on what changed, ranked by priority, with suggested fixes.</li>
                        <li style={docs.li}>React Native and Expo apps in the same dashboard as your website.</li>
                        <li style={docs.li}>Prices in naira through Paystack, with no auto-renewing subscription.</li>
                    </ul>

                    <p style={{ ...docs.p, marginTop: 56 }}>
                        <Link href="/demo" style={docs.link}>Open the live demo</Link> to see it with sample data,
                        or <Link href="/register" style={docs.link}>start free</Link>.
                    </p>
                </div>
            </div>
        </div>
    );
}
