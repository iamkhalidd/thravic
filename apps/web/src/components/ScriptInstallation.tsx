'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

type Platform = 'html' | 'wordpress' | 'shopify' | 'webflow' | 'nextjs';

const PLATFORM_TABS: { id: Platform; label: string; emoji: string }[] = [
    { id: 'html', label: 'HTML', emoji: '🌐' },
    { id: 'wordpress', label: 'WordPress', emoji: '🔵' },
    { id: 'shopify', label: 'Shopify', emoji: '🛍️' },
    { id: 'webflow', label: 'Webflow', emoji: '⚡' },
    { id: 'nextjs', label: 'Next.js / React', emoji: '⚛️' },
];

function getPlatformInstructions(platform: Platform, script: string) {
    switch (platform) {
        case 'html':
            return {
                snippet: script,
                steps: [
                    "Copy the snippet above.",
                    "Open your website's HTML file (usually index.html).",
                    "Paste it just before the closing </head> tag.",
                    "Save and re-deploy your site.",
                    'Click "Verify Installation" below.',
                ],
            };
        case 'wordpress':
            return {
                snippet: script,
                steps: [
                    'Copy the snippet above.',
                    'In your WordPress admin go to Appearance → Theme File Editor.',
                    'Select header.php from the list on the right.',
                    'Paste the snippet just before the closing </head> tag.',
                    'Click Update File.',
                    'Alternatively, install the "Insert Headers and Footers" plugin and paste the snippet in the Header field.',
                    'Click "Verify Installation" below.',
                ],
            };
        case 'shopify':
            return {
                snippet: script,
                steps: [
                    'Copy the snippet above.',
                    'In your Shopify admin go to Online Store → Themes.',
                    'Click the "..." menu next to your current theme and choose Edit code.',
                    'Open Layout → theme.liquid.',
                    'Paste the snippet just before the closing </head> tag.',
                    'Click Save.',
                    'Click "Verify Installation" below.',
                ],
            };
        case 'webflow':
            return {
                snippet: script,
                steps: [
                    'Copy the snippet above.',
                    'Open your Webflow project and go to Project Settings.',
                    'Click the "Custom Code" tab.',
                    'Paste the snippet in the "Head Code" section.',
                    'Click Save Changes, then Publish your site.',
                    'Click "Verify Installation" below.',
                ],
            };
        case 'nextjs':
            return {
                snippet: `// In your app/layout.tsx or pages/_app.tsx
import Script from 'next/script';

// Add inside your root layout <head> or component:
<Script
  id="trackflow"
  strategy="afterInteractive"
  dangerouslySetInnerHTML={{
    __html: \`${script.replace(/`/g, '\\`')}\`
  }}
/>`,
                steps: [
                    'Install the snippet in your root layout file (app/layout.tsx) or pages/_app.tsx.',
                    'Use the Next.js <Script> component with strategy="afterInteractive" as shown above.',
                    'Commit and deploy your changes.',
                    'Click "Verify Installation" below.',
                ],
            };
    }
}

interface ScriptInstallationProps {
    script: string;
}

export function ScriptInstallation({ script }: ScriptInstallationProps) {
    const [platform, setPlatform] = useState<Platform>('html');
    const [copied, setCopied] = useState(false);

    const handleCopyScript = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const platformInfo = getPlatformInstructions(platform, script);

    return (
        <div style={{ marginTop: 'var(--space-md)' }}>
            {/* Platform Tabs */}
            <div style={{
                display: 'flex',
                gap: '6px',
                flexWrap: 'wrap',
                marginBottom: 'var(--space-lg)',
                padding: 'var(--space-xs)',
                background: 'var(--color-bg-tertiary)',
                borderRadius: 'var(--radius-md)',
            }}>
                {PLATFORM_TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setPlatform(tab.id)}
                        style={{
                            flex: '1 1 auto',
                            padding: 'var(--space-xs) var(--space-sm)',
                            background: platform === tab.id ? 'var(--color-bg-card)' : 'transparent',
                            border: platform === tab.id ? '1px solid var(--color-border)' : '1px solid transparent',
                            borderRadius: 'var(--radius-sm)',
                            color: platform === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: platform === tab.id ? 600 : 400,
                            transition: 'all 0.15s',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {tab.emoji} {tab.label}
                    </button>
                ))}
            </div>

            {/* Snippet */}
            <div style={{ position: 'relative', marginBottom: 'var(--space-lg)' }}>
                <pre style={{
                    margin: 0,
                    background: 'var(--color-bg-primary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-md)',
                    paddingRight: '80px',
                    overflow: 'auto',
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-secondary)',
                    maxHeight: '240px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                }}>
                    {platformInfo.snippet}
                </pre>
                <button
                    onClick={() => handleCopyScript(platformInfo.snippet)}
                    className="btn btn-secondary"
                    style={{
                        position: 'absolute',
                        top: 'var(--space-sm)',
                        right: 'var(--space-sm)',
                        padding: 'var(--space-xs) var(--space-sm)',
                        fontSize: '0.8rem',
                    }}
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>

            {/* Step-by-step instructions */}
            <div style={{
                marginBottom: 'var(--space-lg)',
                padding: 'var(--space-md)',
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
            }}>
                <h4 style={{ marginBottom: 'var(--space-sm)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📋 Step-by-step instructions
                </h4>
                <ol style={{
                    paddingLeft: 'var(--space-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-xs)',
                    margin: 0,
                }}>
                    {platformInfo.steps.map((instruction, i) => (
                        <li key={i} style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                            {instruction}
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}
