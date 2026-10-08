'use client';

import { useState } from 'react';
import { Copy, Check, Globe, CircleDot, ShoppingBag, Zap, Atom, ClipboardList, Bot } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { buildInstallPrompt, nextScriptTag, parseTrackerTag } from '@/lib/installPrompt';

type Platform = 'html' | 'wordpress' | 'shopify' | 'webflow' | 'nextjs' | 'ai';

const PLATFORM_TABS: { id: Platform; label: string; icon: LucideIcon }[] = [
    { id: 'html', label: 'HTML', icon: Globe },
    { id: 'wordpress', label: 'WordPress', icon: CircleDot },
    { id: 'shopify', label: 'Shopify', icon: ShoppingBag },
    { id: 'webflow', label: 'Webflow', icon: Zap },
    { id: 'nextjs', label: 'Next.js', icon: Atom },
    { id: 'ai', label: 'AI agent', icon: Bot },
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
        case 'nextjs': {
            const tag = parseTrackerTag(script);
            return {
                snippet: tag
                    ? `// app/layout.tsx (App Router)
import Script from 'next/script';

// inside <body> of the root layout:
${nextScriptTag(tag)}`
                    : script,
                steps: [
                    'App Router: add the <Script> above inside <body> of app/layout.tsx, once.',
                    'Pages Router: paste the plain HTML snippet (HTML tab) inside <Head> in pages/_document.tsx instead.',
                    'Commit and deploy your changes.',
                    'Click "Verify Installation" below.',
                ],
            };
        }
        case 'ai': {
            const tag = parseTrackerTag(script);
            return {
                snippet: tag
                    ? buildInstallPrompt(tag)
                    : `Add this analytics script to this website, once, inside <head> of the shared layout so it loads on every page. Keep it exactly as written.\n\n${script}`,
                steps: [
                    'Copy the prompt above.',
                    'Paste it into your AI coding agent (Cursor, Claude Code, GitHub Copilot, Windsurf, Lovable, Bolt, v0, …) with your website project open.',
                    'Review the change it makes — it should touch one shared file (plus your security policy if you have one).',
                    'Deploy, then click "Verify Installation" below.',
                ],
            };
        }
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
                        <tab.icon size={14} style={{ marginRight: '4px' }} /> {tab.label}
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
                    wordBreak: platform === 'ai' ? 'normal' : 'break-all',
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
                    {copied ? 'Copied!' : platform === 'ai' ? 'Copy prompt' : 'Copy'}
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
                    <ClipboardList size={16} /> Step-by-step instructions
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
