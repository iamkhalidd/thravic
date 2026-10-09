'use client';

import { useState } from 'react';
import { Check, ClipboardList, Copy } from 'lucide-react';

const SDK_PACKAGE = '@thravic/react-native';

type Setup = 'expo' | 'bare';

const INSTALL: Record<Setup, string> = {
    expo: `npx expo install ${SDK_PACKAGE} @react-native-async-storage/async-storage`,
    bare: `npm install ${SDK_PACKAGE} @react-native-async-storage/async-storage\nnpx pod-install`,
};

const NAVIGATION = `// Screen views, with React Navigation or Expo Router
const navigationRef = useNavigationContainerRef();
useEffect(() => Thravic.trackNavigation(navigationRef), [navigationRef]);`;

/** Installing the React Native SDK: the counterpart of ScriptInstallation for an app. */
export function AppInstallation({ init }: { init: string }) {
    const [setup, setSetup] = useState<Setup>('expo');

    return (
        <div style={{ marginTop: 'var(--space-md)' }}>
            <div role="tablist" aria-label="Project type" style={{
                display: 'flex', gap: '6px', flexWrap: 'wrap',
                marginBottom: 'var(--space-lg)', padding: 'var(--space-xs)',
                background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)',
            }}>
                {([['expo', 'Expo'], ['bare', 'React Native CLI']] as const).map(([id, label]) => (
                    <button
                        key={id}
                        role="tab"
                        aria-selected={setup === id}
                        onClick={() => setSetup(id)}
                        style={{
                            padding: '6px 12px',
                            background: setup === id ? 'var(--color-bg-card)' : 'transparent',
                            border: setup === id ? '1px solid var(--color-border)' : '1px solid transparent',
                            borderRadius: 'var(--radius-sm)',
                            color: setup === id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                            cursor: 'pointer', fontSize: '0.8125rem', fontWeight: setup === id ? 600 : 400,
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <Snippet label="1. Install the SDK" code={INSTALL[setup]} />
            <Snippet label="2. Start it when your app loads" code={init} />
            <Snippet label="3. Track screens (optional)" code={NAVIGATION} />

            <div style={{
                marginBottom: 'var(--space-lg)', padding: 'var(--space-md)',
                background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
            }}>
                <h4 style={{ marginBottom: 'var(--space-sm)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ClipboardList size={16} /> What happens next
                </h4>
                <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: 4 }}>
                    {[
                        setup === 'expo'
                            ? 'Works in Expo Go and development builds: no config plugin needed.'
                            : 'Rebuild the app after installing, so the storage module is linked.',
                        'Open the app and visit a screen or two.',
                        'Click "Verify installation" below. Sessions, screens and versions appear within a minute.',
                    ].map(step => (
                        <li key={step} style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{step}</li>
                    ))}
                </ol>
            </div>
        </div>
    );
}

function Snippet({ label, code }: { label: string; code: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{label}</div>
            <div style={{ position: 'relative' }}>
                <pre style={{
                    margin: 0, background: 'var(--color-bg-primary)',
                    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                    padding: '12px 88px 12px 12px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto',
                }}>
                    {code}
                </pre>
                <button
                    onClick={copy}
                    className="btn btn-secondary"
                    style={{ position: 'absolute', top: 8, right: 8, padding: '4px 10px', fontSize: '0.8rem' }}
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
        </div>
    );
}
