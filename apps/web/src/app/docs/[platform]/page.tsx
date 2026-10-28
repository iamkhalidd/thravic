import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { pageMetadata } from '@/lib/site';
import { INSTALL_PLATFORMS, getPlatformInstructions, type InstallPlatform } from '@/lib/installGuides';
import { docs, EXAMPLE_SCRIPT } from '../docsStyles';

// The same steps the dashboard's install panel shows, as public pages.

const VERIFY_STEP = 'In your Thravic dashboard, open the site and click Verify Installation.';

function find(id: string) {
    return INSTALL_PLATFORMS.find(p => p.id === id);
}

export const dynamicParams = false;

export function generateStaticParams() {
    return INSTALL_PLATFORMS.map(p => ({ platform: p.id }));
}

export function generateMetadata({ params }: { params: { platform: string } }): Metadata {
    const platform = find(params.platform);
    if (!platform) return {};
    return pageMetadata(
        `/docs/${platform.id}`,
        platform.title,
        `${platform.summary} Add Thravic session replays, heatmaps and funnels to your ${['ai', 'html', 'gtm'].includes(platform.id) ? '' : `${platform.label} `}site in a few minutes.`,
    );
}

export default function InstallGuidePage({ params }: { params: { platform: string } }) {
    const platform = find(params.platform);
    if (!platform) notFound();
    const { snippet, steps, download, note } = getPlatformInstructions(platform.id as InstallPlatform, EXAMPLE_SCRIPT, VERIFY_STEP);
    const others = INSTALL_PLATFORMS.filter(p => p.id !== platform.id);

    return (
        <div style={docs.page}>
            <div style={docs.container}>
                <Link href="/docs" style={docs.back}><ArrowLeft size={16} /> All install guides</Link>

                <h1 style={docs.h1}>{platform.title}</h1>
                <p style={docs.lead}>
                    {platform.summary} The script is about 6 KB gzipped and loads asynchronously, so it won&apos;t hold up your pages.
                </p>

                <h2 style={{ ...docs.h2, marginTop: 0 }}>1. Get your tracking ID</h2>
                <p style={docs.p}>
                    <Link href="/register" style={docs.link}>Create a free account</Link>, then add your site in the dashboard.
                    It shows {platform.id === 'ai' ? 'the prompt below' : platform.id === 'wordpress' ? 'your tracking ID' : 'the snippet below'} with
                    your own tracking ID filled in; the ID here is only an example.
                </p>

                <h2 style={docs.h2}>2. {platform.id === 'ai' ? 'The prompt' : platform.id === 'wordpress' ? 'The plugin and your tracking ID' : 'The snippet'}</h2>
                {download && (
                    <p style={docs.p}>
                        <a href={download.href} style={docs.link}>{download.label}</a> (thravic.zip). Coming soon to the WordPress.org plugin directory.
                    </p>
                )}
                <pre style={docs.pre}><code>{snippet}</code></pre>

                <h2 style={docs.h2}>3. Add it</h2>
                {note && <p style={docs.p}><strong>Before you start:</strong> {note}</p>}
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                    {steps.map(step => <li key={step} style={docs.li}>{step}</li>)}
                </ol>
                <p style={{ ...docs.p, marginTop: 16 }}>
                    Data appears within a few minutes of your first visitor. Form inputs are masked in the browser before anything is sent.
                </p>

                <h2 style={docs.h2}>Other platforms</h2>
                <p style={docs.p}>
                    {others.map((p, i) => (
                        <span key={p.id}>
                            {i > 0 && ' · '}
                            <Link href={`/docs/${p.id}`} style={docs.link}>{p.label}</Link>
                        </span>
                    ))}
                    {' · '}<Link href="/docs/react-native" style={docs.link}>React Native and Expo</Link>
                </p>
            </div>
        </div>
    );
}
