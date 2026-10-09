'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowRight,
    Check,
    ExternalLink,
    CheckCircle2,
    Loader2,
    AlertCircle,
    RefreshCw,
    Globe,
    Smartphone,
} from 'lucide-react';
import { domains } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import type { Platform } from '@/types';

import { ScriptInstallation } from '@/components/ScriptInstallation';
import { AppInstallation } from '@/components/AppInstallation';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';

type Step = 'add' | 'script' | 'verify';
type Kind = 'web' | 'app';
type AppPlatform = Exclude<Platform, 'web'>;

const APP_PLATFORMS: Array<{ value: AppPlatform; label: string }> = [
    { value: 'cross', label: 'iOS and Android' },
    { value: 'ios', label: 'iOS' },
    { value: 'android', label: 'Android' },
];

export default function NewDomainPage() {
    const router = useRouter();
    const { refresh, setSelectedDomainId } = useDomain();
    const [kind, setKind] = useState<Kind>('web');
    const [appPlatform, setAppPlatform] = useState<AppPlatform>('cross');
    const [step, setStep] = useState<Step>('add');
    const [domain, setDomain] = useState('');
    const [name, setName] = useState('');
    const [domainId, setDomainId] = useState<string | null>(null);
    const [script, setScript] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [verified, setVerified] = useState(false);
    const [verifyMessage, setVerifyMessage] = useState('');

    const app = kind === 'app';

    const chooseKind = (next: Kind) => {
        setKind(next);
        setError('');
    };

    const handleAddDomain = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await domains.create(domain.trim(), name.trim(), app ? appPlatform : 'web');

        if (result.error) {
            setError(result.error);
            setLoading(false);
            return;
        }

        if (result.data) {
            setDomainId(result.data.id);

            const scriptResult = await domains.getScript(result.data.id);
            if (scriptResult.data) {
                setScript(scriptResult.data.script);
            }

            setStep('script');
        }

        setLoading(false);
    };

    const handleVerify = async () => {
        if (!domainId) return;

        setLoading(true);
        setError('');
        setVerifyMessage('');

        const result = await domains.verify(domainId);

        if (result.data?.verified) {
            setVerified(true);
            setStep('verify');
        } else {
            // Show the message from the server (script not found / no data from the app yet)
            const msg = (result.data as any)?.message || result.error || 'Could not verify installation. Please make sure the script is installed correctly.';
            setVerifyMessage(msg);
        }

        setLoading(false);
    };

    // Into the dashboard on the new property, not whichever was selected before.
    const openDashboard = async () => {
        await refresh();
        if (domainId) setSelectedDomainId(domainId);
        router.push('/dashboard');
    };

    const steps = STEPS(app);
    const stepIndex = steps.findIndex(s => s.key === step);

    return (
        <div className="page-stack" style={{ maxWidth: '720px', margin: '0 auto' }}>
            <PageHeader
                title={step === 'add' ? 'Add a website or app' : app ? 'Add an app' : 'Add a website'}
                subtitle={app
                    ? 'Add your app, install the SDK, then verify it.'
                    : 'Add your site, install the tracking script, then verify it.'}
            />

            {/* Progress steps */}
            <ol aria-label="Progress" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {steps.map((s, i) => {
                    const isActive = i === stepIndex;
                    const isPast = i < stepIndex;
                    return (
                        <li key={s.key} aria-current={isActive ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < steps.length - 1 ? '1 1 0' : '0 0 auto', minWidth: 0 }}>
                            <span style={{
                                width: 22,
                                height: 22,
                                flexShrink: 0,
                                borderRadius: 'var(--radius-full)',
                                border: `1px solid ${isPast || isActive ? 'var(--color-text-primary)' : 'var(--color-border)'}`,
                                background: isPast ? 'var(--color-text-primary)' : 'transparent',
                                color: isPast ? 'var(--color-bg-primary)' : isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                            }}>
                                {isPast ? <Check size={12} aria-label="Done" /> : i + 1}
                            </span>
                            <span style={{
                                fontSize: '0.8125rem',
                                fontWeight: isActive ? 500 : 400,
                                whiteSpace: 'nowrap',
                                color: isActive || isPast ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            }}>
                                {s.label}
                            </span>
                            {i < steps.length - 1 && (
                                <span aria-hidden="true" style={{
                                    flex: 1,
                                    minWidth: 16,
                                    height: 1,
                                    background: isPast ? 'var(--color-text-primary)' : 'var(--color-border)',
                                }} />
                            )}
                        </li>
                    );
                })}
            </ol>

            {/* Step 1: What to track, then its details */}
            {step === 'add' && (
                <ChartCard
                    title="What do you want to track?"
                    subtitle={app ? 'A React Native or Expo app, on iOS, Android or both.' : 'Enter your domain to generate a tracking script.'}
                >
                    <div role="radiogroup" aria-label="Property type" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, margin: '4px 0 16px' }}>
                        {KINDS.map(option => {
                            const selected = kind === option.value;
                            const Icon = option.icon;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => chooseKind(option.value)}
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left',
                                        padding: '12px 14px', cursor: 'pointer',
                                        background: selected ? 'var(--color-bg-hover)' : 'transparent',
                                        border: `1px solid ${selected ? 'var(--color-text-primary)' : 'var(--color-border)'}`,
                                        borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)',
                                    }}
                                >
                                    <Icon size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                                    <span>
                                        <span style={{ display: 'block', fontWeight: 500, fontSize: '0.875rem' }}>{option.label}</span>
                                        <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>{option.description}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {error && (
                        <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem', marginBottom: 12 }}>
                            {error}
                        </p>
                    )}

                    <form onSubmit={handleAddDomain}>
                        {app ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                                <div>
                                    <label htmlFor="app-name" style={labelStyle}>App name</label>
                                    <input
                                        id="app-name"
                                        type="text"
                                        className="input"
                                        placeholder="Acme Shop"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="bundle-id" style={labelStyle}>Bundle ID</label>
                                    <input
                                        id="bundle-id"
                                        type="text"
                                        className="input"
                                        placeholder="com.acme.shop"
                                        value={domain}
                                        onChange={(e) => setDomain(e.target.value)}
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        aria-describedby="bundle-id-hint"
                                        required
                                    />
                                    <div id="bundle-id-hint" style={hintStyle}>
                                        The <code>ios.bundleIdentifier</code> or <code>android.package</code> in your app config.
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="app-platform" style={labelStyle}>Runs on</label>
                                    <select
                                        id="app-platform"
                                        className="input"
                                        value={appPlatform}
                                        onChange={(e) => setAppPlatform(e.target.value as AppPlatform)}
                                    >
                                        {APP_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    </select>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
                                <div>
                                    <label htmlFor="domain" style={labelStyle}>Domain</label>
                                    <input
                                        id="domain"
                                        type="text"
                                        className="input"
                                        placeholder="example.com"
                                        value={domain}
                                        onChange={(e) => setDomain(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="domain-name" style={labelStyle}>
                                        Name <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span>
                                    </label>
                                    <input
                                        id="domain-name"
                                        type="text"
                                        className="input"
                                        placeholder="My website"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                {loading ? 'Creating…' : 'Continue'}
                                {!loading && <ArrowRight size={16} />}
                            </button>
                        </div>
                    </form>
                </ChartCard>
            )}

            {/* Step 2: Install the script or the SDK */}
            {step === 'script' && (
                <ChartCard
                    title={app ? 'Install the SDK' : 'Install the tracking script'}
                    subtitle={app ? 'Add Thravic to your app and start it when the app loads.' : 'Select your platform and follow the steps to install Thravic.'}
                >
                    {app ? <AppInstallation init={script} /> : <ScriptInstallation script={script} />}

                    {verifyMessage && (
                        <div role="alert" style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '10px 12px',
                            border: '1px solid var(--color-error)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--color-error)',
                            fontSize: '0.8125rem',
                            marginBottom: 12,
                        }}>
                            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                            <span>{verifyMessage}</span>
                        </div>
                    )}

                    <div className="flex gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                            onClick={handleVerify}
                            className="btn btn-primary"
                            disabled={loading}
                        >
                            {loading
                                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Checking…</>
                                : verifyMessage
                                    ? <><RefreshCw size={16} /> Try again</>
                                    : 'Verify installation'
                            }
                        </button>
                        {!app && (
                            <a
                                href={`https://${domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary"
                            >
                                <ExternalLink size={16} />
                                Open site
                            </a>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                            {app ? 'Not ready to run the app yet?' : 'Site behind auth or not deployed yet?'}{' '}
                            <button
                                onClick={openDashboard}
                                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline' }}
                            >
                                Skip for now
                            </button>
                        </span>
                    </div>

                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </ChartCard>
            )}

            {/* Step 3: Verified */}
            {step === 'verify' && verified && (
                <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
                    <CheckCircle2 size={28} aria-hidden="true" style={{ color: 'var(--color-success)', marginBottom: 10 }} />
                    <h2 className="card-title" style={{ fontSize: '1rem', marginBottom: 4 }}>You&apos;re all set</h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                        {app
                            ? 'Your app is sending data. Screens, sessions and versions fill in as people use it.'
                            : 'Your tracking script is installed and verified. Data appears within a few minutes of your first visitor.'}
                    </p>
                    <button onClick={openDashboard} className="btn btn-primary">
                        Go to dashboard
                        <ArrowRight size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}

const KINDS: Array<{ value: Kind; label: string; description: string; icon: typeof Globe }> = [
    { value: 'web', label: 'Website', description: 'Any site, with a one-line script.', icon: Globe },
    { value: 'app', label: 'Mobile app', description: 'React Native or Expo, with our SDK.', icon: Smartphone },
];

const STEPS = (app: boolean): Array<{ key: Step; label: string }> => [
    { key: 'add', label: app ? 'Add app' : 'Add website' },
    { key: 'script', label: app ? 'Install SDK' : 'Install script' },
    { key: 'verify', label: 'Verify' },
];

const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
};

const hintStyle: React.CSSProperties = {
    marginTop: 4,
    fontSize: '0.75rem',
    color: 'var(--color-text-muted)',
};
