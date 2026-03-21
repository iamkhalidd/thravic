'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Globe,
    ArrowRight,
    Copy,
    Check,
    ExternalLink,
    CheckCircle2,
    Loader2,
    AlertCircle,
    RefreshCw,
} from 'lucide-react';
import { domains } from '@/lib/api';

import { ScriptInstallation } from '@/components/ScriptInstallation';

type Step = 'add' | 'script' | 'verify';

export default function NewDomainPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('add');
    const [domain, setDomain] = useState('');
    const [name, setName] = useState('');
    const [domainId, setDomainId] = useState<string | null>(null);
    const [script, setScript] = useState('');
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [verified, setVerified] = useState(false);
    const [verifyMessage, setVerifyMessage] = useState('');

    const handleAddDomain = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await domains.create(domain, name);

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

    const handleCopyScript = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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
            // Show the message from the server (script not found / unreachable)
            const msg = (result.data as any)?.message || result.error || 'Could not verify installation. Please make sure the script is installed correctly.';
            setVerifyMessage(msg);
        }

        setLoading(false);
    };

    return (
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            <h1 style={{ marginBottom: 'var(--space-lg)' }}>Add New Domain</h1>

            {/* Progress Steps */}
            <div className="flex items-center gap-md" style={{ marginBottom: 'var(--space-xl)' }}>
                {[
                    { key: 'add', label: 'Add Domain' },
                    { key: 'script', label: 'Install Script' },
                    { key: 'verify', label: 'Verify' }
                ].map((s, i) => {
                    const isActive = step === s.key;
                    const isPast = ['add', 'script', 'verify'].indexOf(step) > i;

                    return (
                        <div key={s.key} className="flex items-center gap-sm" style={{ flex: 1 }}>
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: 'var(--radius-full)',
                                background: isPast || isActive ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)',
                                color: isPast || isActive ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 600,
                                fontSize: '0.875rem'
                            }}>
                                {isPast ? <Check size={16} /> : i + 1}
                            </div>
                            <span style={{
                                fontSize: '0.875rem',
                                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)'
                            }}>
                                {s.label}
                            </span>
                            {i < 2 && (
                                <div style={{
                                    flex: 1,
                                    height: '2px',
                                    background: isPast ? 'var(--color-accent-primary)' : 'var(--color-border)'
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Step 1: Add Domain */}
            {step === 'add' && (
                <div className="card" style={{ padding: 'var(--space-xl)' }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--color-accent-gradient)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto var(--space-lg)'
                    }}>
                        <Globe size={24} color="white" />
                    </div>

                    <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-sm)' }}>Add your website</h2>
                    <p style={{ textAlign: 'center', marginBottom: 'var(--space-xl)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        Enter your domain to generate a tracking script
                    </p>

                    {error && (
                        <div style={{
                            padding: 'var(--space-md)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid var(--color-error)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--color-error)',
                            fontSize: '0.875rem',
                            marginBottom: 'var(--space-lg)'
                        }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleAddDomain}>
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                            <label style={{
                                display: 'block',
                                marginBottom: 'var(--space-xs)',
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)'
                            }}>
                                Domain
                            </label>
                            <input
                                type="text"
                                className="input"
                                placeholder="example.com"
                                value={domain}
                                onChange={(e) => setDomain(e.target.value)}
                                required
                            />
                        </div>

                        <div style={{ marginBottom: 'var(--space-lg)' }}>
                            <label style={{
                                display: 'block',
                                marginBottom: 'var(--space-xs)',
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)'
                            }}>
                                Name <span style={{ color: 'var(--color-text-muted)' }}>(optional)</span>
                            </label>
                            <input
                                type="text"
                                className="input"
                                placeholder="My Website"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading}
                            style={{ width: '100%' }}
                        >
                            {loading ? 'Creating...' : 'Continue'}
                            {!loading && <ArrowRight size={18} />}
                        </button>
                    </form>
                </div>
            )}

            {/* Step 2: Install Script */}
            {step === 'script' && (
                <div className="card" style={{ padding: 'var(--space-xl)' }}>
                    <h2 style={{ marginBottom: 'var(--space-xs)' }}>Install tracking script</h2>
                    <p style={{ marginBottom: 'var(--space-lg)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        Select your platform below and follow the steps to install Thravic.
                    </p>

                    <ScriptInstallation script={script} />

                    {/* Error / Verify message */}
                    {verifyMessage && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 'var(--space-sm)',
                            padding: 'var(--space-md)',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--color-error)',
                            fontSize: '0.875rem',
                            marginBottom: 'var(--space-lg)',
                        }}>
                            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>{verifyMessage}</span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-md">
                        <button
                            onClick={handleVerify}
                            className="btn btn-primary"
                            disabled={loading}
                            style={{ flex: 1 }}
                        >
                            {loading
                                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Checking...</>
                                : verifyMessage
                                    ? <><RefreshCw size={16} /> Try Again</>
                                    : 'Verify Installation'
                            }
                        </button>
                        <a
                            href={`https://${domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                            title="Open your site"
                        >
                            <ExternalLink size={18} />
                        </a>
                    </div>

                    {/* Skip option */}
                    <p style={{ textAlign: 'center', marginTop: 'var(--space-md)', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                        Site behind auth or not deployed yet?{' '}
                        <button
                            onClick={() => router.push('/dashboard')}
                            style={{ background: 'none', border: 'none', color: 'var(--color-accent-primary)', cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline' }}
                        >
                            Skip for now
                        </button>
                    </p>

                    {/* Spin keyframe */}
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {/* Step 3: Verified */}
            {step === 'verify' && verified && (
                <div className="card" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
                    <div style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: 'var(--radius-full)',
                        background: 'rgba(16, 185, 129, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto var(--space-lg)',
                        border: '2px solid rgba(16, 185, 129, 0.3)',
                    }}>
                        <CheckCircle2 size={36} style={{ color: 'var(--color-success)' }} />
                    </div>

                    <h2 style={{ marginBottom: 'var(--space-sm)' }}>You&apos;re all set!</h2>
                    <p style={{ marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        Your tracking script is installed and verified.
                    </p>
                    <p style={{ marginBottom: 'var(--space-xl)', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        Data will start appearing in your dashboard within a few minutes of your first visitor.
                    </p>

                    <button
                        onClick={() => router.push('/dashboard')}
                        className="btn btn-primary"
                        style={{ padding: 'var(--space-md) var(--space-xl)' }}
                    >
                        Go to Dashboard
                        <ArrowRight size={18} />
                    </button>
                </div>
            )}
        </div>
    );
}
