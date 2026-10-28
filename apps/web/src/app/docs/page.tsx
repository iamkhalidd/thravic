import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { pageMetadata } from '@/lib/site';
import { INSTALL_PLATFORMS } from '@/lib/installGuides';
import { docs } from './docsStyles';

export const metadata: Metadata = pageMetadata(
    '/docs',
    'Install guides',
    'Add Thravic to a website on WordPress, Shopify, Wix, Squarespace, Webflow, Framer, Ghost, Carrd, Bubble, Blogger, Joomla, Drupal, Google Tag Manager, Next.js or plain HTML, or to a React Native or Expo app.',
);

export default function DocsIndexPage() {
    return (
        <div style={docs.page}>
            <div style={docs.container}>
                <Link href="/" style={docs.back}><ArrowLeft size={16} /> Back to Home</Link>

                <h1 style={docs.h1}>Install guides</h1>
                <p style={docs.lead}>
                    A website needs one script tag in its head. An app needs one package and one line of setup.
                    Pick your platform below.
                </p>

                <h2 style={{ ...docs.h2, marginTop: 0 }}>Websites</h2>
                <ul className="docs-guides">
                    {INSTALL_PLATFORMS.map(p => (
                        <li key={p.id}>
                            <Link href={`/docs/${p.id}`}>
                                <strong>{p.label}</strong>
                                <span>{p.summary}</span>
                            </Link>
                        </li>
                    ))}
                </ul>

                <h2 style={docs.h2}>Mobile apps</h2>
                <ul className="docs-guides">
                    <li>
                        <Link href="/docs/react-native">
                            <strong>React Native and Expo</strong>
                            <span>Screens, sessions, versions and devices, in the same dashboard. Works in Expo Go.</span>
                        </Link>
                    </li>
                </ul>

                <p style={{ ...docs.p, marginTop: 56 }}>
                    <Link href="/register" style={docs.link}>Create a free account</Link> to get your tracking ID,
                    or <Link href="/demo" style={docs.link}>open the demo</Link> to see what you get.
                </p>
            </div>
        </div>
    );
}
