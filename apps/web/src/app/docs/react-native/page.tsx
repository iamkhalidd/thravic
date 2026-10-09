import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { pageMetadata } from '@/lib/site';

export const metadata: Metadata = pageMetadata(
    '/docs/react-native',
    'React Native and Expo analytics',
    'Track screens, sessions, app versions and devices in a React Native or Expo app with the @thravic/react-native SDK, in the same dashboard as your website.',
);

// Mirrors packages/sdk-react-native/README.md; keep the two in step.

const s = {
    page: { minHeight: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', padding: '80px 16px' },
    container: { maxWidth: '760px', margin: '0 auto' },
    h1: { fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 600, letterSpacing: '-0.03em', margin: '0 0 16px' },
    lead: { fontSize: '1.125rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 48px' },
    h2: { fontSize: '1.5rem', fontWeight: 600, margin: '56px 0 16px' },
    h3: { fontSize: '1.0625rem', fontWeight: 600, margin: '28px 0 12px' },
    p: { fontSize: '1rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, margin: '0 0 16px' },
    pre: {
        background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
        padding: '14px 16px', margin: '0 0 16px', overflowX: 'auto' as const, fontSize: '0.8125rem',
        fontFamily: 'var(--font-mono)', lineHeight: 1.6,
    },
    li: { fontSize: '1rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 8 },
    th: { textAlign: 'left' as const, padding: '8px 12px 8px 0', borderBottom: '1px solid var(--color-border)', fontWeight: 600 },
    td: { padding: '8px 12px 8px 0', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', verticalAlign: 'top' as const },
};

const OPTIONS: [string, string, string][] = [
    ['bundleId', "'app'", 'Your bundle ID. Screens are recorded as app://com.acme.shop/Home.'],
    ['appVersion', 'none', 'Shown under Versions. In Expo, use Application.nativeApplicationVersion from expo-application.'],
    ['apiUrl', 'Thravic', 'Where events are sent. The code in your dashboard fills it in.'],
    ['sessionTimeoutMinutes', '30', 'Time in the background after which the next open starts a new session.'],
    ['flushIntervalSeconds', '10', 'How often queued events are sent.'],
    ['debug', 'false', 'Log every event to the console.'],
];

function Code({ children }: { children: string }) {
    return <pre style={s.pre}><code>{children}</code></pre>;
}

export default function ReactNativeDocsPage() {
    return (
        <div style={s.page}>
            <div style={s.container}>
                <Link href="/" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)',
                    textDecoration: 'none', fontSize: '0.875rem', marginBottom: 40,
                }}>
                    <ArrowLeft size={16} /> Back to Home
                </Link>

                <h1 style={s.h1}>React Native and Expo</h1>
                <p style={s.lead}>
                    Track screens, sessions, app versions and devices, plus your own events, in the same dashboard as your website.
                    The SDK works in Expo Go and needs no config plugin.
                </p>

                <h2 style={s.h2}>1. Add your app</h2>
                <p style={s.p}>
                    In the dashboard, choose <strong>Add website or app</strong>, then <strong>Mobile app</strong>.
                    Enter the app&apos;s name and bundle ID. You get a tracking ID and the exact code for your app.
                </p>

                <h2 style={s.h2}>2. Install</h2>
                <h3 style={s.h3}>Expo</h3>
                <Code>{'npx expo install @thravic/react-native @react-native-async-storage/async-storage'}</Code>
                <h3 style={s.h3}>React Native CLI</h3>
                <Code>{'npm install @thravic/react-native @react-native-async-storage/async-storage\nnpx pod-install'}</Code>

                <h2 style={s.h2}>3. Start tracking</h2>
                <p style={s.p}>Call <code>init</code> once, as early as you can, with the values from your dashboard:</p>
                <Code>{`import { Thravic } from '@thravic/react-native';

Thravic.init('TF-1A2B3C4D', {
  bundleId: 'com.acme.shop',
  appVersion: '1.4.0',
});`}</Code>
                <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr><th style={s.th}>Option</th><th style={s.th}>Default</th><th style={s.th}>What it does</th></tr>
                        </thead>
                        <tbody>
                            {OPTIONS.map(([name, def, what]) => (
                                <tr key={name}>
                                    <td style={s.td}><code>{name}</code></td>
                                    <td style={s.td}><code>{def}</code></td>
                                    <td style={s.td}>{what}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <h2 style={s.h2}>4. Track screens</h2>
                <h3 style={s.h3}>React Navigation</h3>
                <Code>{`import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { Thravic } from '@thravic/react-native';

const navigationRef = createNavigationContainerRef();

export default function App() {
  return (
    <NavigationContainer ref={navigationRef} onReady={() => Thravic.trackNavigation(navigationRef)}>
      {/* ... */}
    </NavigationContainer>
  );
}`}</Code>
                <h3 style={s.h3}>Expo Router</h3>
                <Code>{`// app/_layout.tsx
import { Stack, useNavigationContainerRef } from 'expo-router';
import { useEffect } from 'react';
import { Thravic } from '@thravic/react-native';

Thravic.init('TF-1A2B3C4D', { bundleId: 'com.acme.shop' });

export default function Layout() {
  const ref = useNavigationContainerRef();
  useEffect(() => Thravic.trackNavigation(ref), [ref]);
  return <Stack />;
}`}</Code>
                <h3 style={s.h3}>By hand</h3>
                <Code>{"Thravic.screen('Checkout');"}</Code>

                <h2 style={s.h2}>Events and users</h2>
                <Code>{`Thravic.track('purchase', { amount: 49, currency: 'USD' });
Thravic.identify('user-42');`}</Code>
                <p style={s.p}>Use your events as funnel steps, or send them to your own systems with webhooks.</p>

                <h2 style={s.h2}>Privacy</h2>
                <Code>{`Thravic.optOut(); // stops tracking and drops unsent events; remembered across launches
Thravic.optIn();
Thravic.isOptedOut();`}</Code>
                <p style={s.p}>
                    The SDK stores a random visitor ID on the device. It doesn&apos;t read the advertising ID, contacts, location
                    or any other data that needs a permission. Thravic gets the country from the request IP and then discards the IP.
                </p>

                <h2 style={s.h2}>What you see in the dashboard</h2>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                    <li style={s.li}><strong>Overview:</strong> users, screen views, sessions, bounce rate and session length.</li>
                    <li style={s.li}><strong>Screens:</strong> views, time on screen, entries and exits for each screen.</li>
                    <li style={s.li}><strong>Paths and funnels:</strong> how people move between screens, and where they drop off.</li>
                    <li style={s.li}><strong>Versions and devices:</strong> app versions, OS versions and device models.</li>
                </ul>

                <h2 style={s.h2}>How it works</h2>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                    <li style={s.li}>A session starts when the app opens and ends when it goes to the background. Coming back within the session timeout continues the same session.</li>
                    <li style={s.li}>Events are queued on the device and sent in batches. Failed sends are retried, including after a restart, and up to 1,000 events are kept offline.</li>
                    <li style={s.li}>Every event carries the OS and its version, device model, app version, screen size and language.</li>
                </ul>

                <p style={{ ...s.p, marginTop: 56 }}>
                    <Link href="/register" style={{ color: 'var(--color-accent-primary)' }}>Create a free account</Link> to get your tracking ID.
                </p>
            </div>
        </div>
    );
}
