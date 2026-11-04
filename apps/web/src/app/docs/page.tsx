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
                            <span>Screens, sessions, versions, devices and A/B tests, in the same dashboard. Works in Expo Go.</span>
                        </Link>
                    </li>
                </ul>

                <h2 style={docs.h2}>Your own events</h2>
                <p style={docs.p}>
                    Page views, clicks and errors are tracked for you. Send anything else, such as a signup or a purchase, with
                    {' '}<code>TF(&apos;track&apos;)</code>. Events can be funnel steps, goals for A/B tests, or sent on with webhooks.
                </p>
                <pre style={docs.pre}><code>{`TF('track', 'signup');
TF('track', 'purchase', { amount: 49, currency: 'USD' });
TF('identify', 'user-42');`}</code></pre>
                <p style={docs.p}>
                    The script loads asynchronously. If your code can run before it does, add this line above it once, and calls made
                    early are kept until the script is ready:
                </p>
                <pre style={docs.pre}><code>{`<script>window.TF = window.TF || function () { (window.__TF_Q__ = window.__TF_Q__ || []).push(arguments); };</script>`}</code></pre>

                <h2 id="ab-tests" style={docs.h2}>A/B tests</h2>
                <p style={docs.p}>
                    Create a test under <strong>Experiments</strong> in the dashboard (Pro plan) and start it. Then ask for the
                    visitor&apos;s version where the page shows the change, and send the goal when the visitor converts:
                </p>
                <pre style={docs.pre}><code>{`TF('variant', 'new-pricing', function (version) {
  if (version === 'b') {
    // show the new version
  }
});

// when the visitor reaches the goal
TF('track', 'signup');`}</code></pre>
                <p style={docs.p}>
                    The callback gets the version id from the dashboard, or <code>null</code> for the original: the visitor isn&apos;t in
                    the test, the test isn&apos;t running, or it couldn&apos;t load within 3 seconds. Hide the part that changes until the
                    callback runs, so visitors don&apos;t see it flicker.
                </p>
                <p style={docs.p}>
                    A visitor always gets the same version, on your website and in your app. The dashboard counts the goals each version
                    reaches and calls a winner once one version has a 95% chance of being the best.
                </p>

                <p style={{ ...docs.p, marginTop: 56 }}>
                    <Link href="/register" style={docs.link}>Create a free account</Link> to get your tracking ID,
                    or <Link href="/demo" style={docs.link}>open the demo</Link> to see what you get.
                </p>
            </div>
        </div>
    );
}
