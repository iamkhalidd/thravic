'use client';

import { useState } from 'react';
import { Copy, Check, Globe, CircleDot, ShoppingBag, Zap, Atom, ClipboardList, Bot } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { INSTALL_PLATFORMS, getPlatformInstructions, type InstallPlatform } from '@/lib/installGuides';

const PLATFORM_ICONS: Record<InstallPlatform, LucideIcon> = {
    html: Globe,
    wordpress: CircleDot,
    shopify: ShoppingBag,
    webflow: Zap,
    nextjs: Atom,
    ai: Bot,
};

const VERIFY_STEP = 'Click "Verify Installation" below.';

interface ScriptInstallationProps {
    script: string;
}

export function ScriptInstallation({ script }: ScriptInstallationProps) {
    const [platform, setPlatform] = useState<InstallPlatform>('html');
    const [copied, setCopied] = useState(false);

    const handleCopyScript = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const platformInfo = getPlatformInstructions(platform, script, VERIFY_STEP);

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
                {INSTALL_PLATFORMS.map(tab => {
                    const Icon = PLATFORM_ICONS[tab.id];
                    return (
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
                        <Icon size={14} style={{ marginRight: '4px' }} /> {tab.label}
                    </button>
                    );
                })}
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
