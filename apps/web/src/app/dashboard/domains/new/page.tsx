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
    Loader2
} from 'lucide-react';
import { domains } from '@/lib/api';

type Step = 'add' | 'script' | 'verify';

export default function NewDomainPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('add');
    const [domain, setDomain] = useState('');
    const [name, setName] = useState('');
    const [domainId, setDomainId] = useState<string | null>(null);
    const [script, setScript] = useState('');
    const [instructions, setInstructions] = useState<string[]>([]);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [verified, setVerified] = useState(false);

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

            // Get script
            const scriptResult = await domains.getScript(result.data.id);
            if (scriptResult.data) {
                setScript(scriptResult.data.script);
                setInstructions(scriptResult.data.instructions);
            }

            setStep('script');
        }

        setLoading(false);
    };

    const handleCopyScript = () => {
        navigator.clipboard.writeText(script);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleVerify = async () => {
        if (!domainId) return;

        setLoading(true);
        const result = await domains.verify(domainId);

        if (result.data?.verified) {
            setVerified(true);
            setStep('verify');
        } else {
            setError('Could not verify installation. Please make sure the script is installed correctly.');
        }

        setLoading(false);
    };

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
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
                    <p style={{ textAlign: 'center', marginBottom: 'var(--space-xl)', fontSize: '0.875rem' }}>
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
                                Name (optional)
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
                    <h2 style={{ marginBottom: 'var(--space-md)' }}>Install tracking script</h2>
                    <p style={{ marginBottom: 'var(--space-lg)', fontSize: '0.875rem' }}>
                        Copy and paste this script into the <code>&lt;head&gt;</code> section of your website.
                    </p>

                    {/* Script Block */}
                    <div style={{
                        position: 'relative',
                        marginBottom: 'var(--space-lg)'
                    }}>
                        <pre style={{
                            background: 'var(--color-bg-primary)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--space-md)',
                            overflow: 'auto',
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-text-secondary)'
                        }}>
                            {script}
                        </pre>
                        <button
                            onClick={handleCopyScript}
                            className="btn btn-secondary"
                            style={{
                                position: 'absolute',
                                top: 'var(--space-sm)',
                                right: 'var(--space-sm)',
                                padding: 'var(--space-xs) var(--space-sm)'
                            }}
                        >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>

                    {/* Instructions */}
                    <div style={{ marginBottom: 'var(--space-lg)' }}>
                        <h4 style={{ marginBottom: 'var(--space-sm)', fontSize: '0.875rem' }}>Instructions</h4>
                        <ol style={{
                            paddingLeft: 'var(--space-lg)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-xs)'
                        }}>
                            {instructions.map((instruction, i) => (
                                <li key={i} style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                    {instruction}
                                </li>
                            ))}
                        </ol>
                    </div>

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

                    <div className="flex gap-md">
                        <button
                            onClick={handleVerify}
                            className="btn btn-primary"
                            disabled={loading}
                            style={{ flex: 1 }}
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Verify Installation'}
                        </button>
                        <a
                            href={`https://${domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                        >
                            <ExternalLink size={18} />
                        </a>
                    </div>
                </div>
            )}

            {/* Step 3: Verified */}
            {step === 'verify' && verified && (
                <div className="card" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: 'var(--radius-full)',
                        background: 'rgba(16, 185, 129, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto var(--space-lg)'
                    }}>
                        <CheckCircle2 size={32} style={{ color: 'var(--color-success)' }} />
                    </div>

                    <h2 style={{ marginBottom: 'var(--space-sm)' }}>You're all set!</h2>
                    <p style={{ marginBottom: 'var(--space-xl)', fontSize: '0.875rem' }}>
                        Your tracking script is installed and working. Data will start appearing in your dashboard shortly.
                    </p>

                    <button
                        onClick={() => router.push('/dashboard')}
                        className="btn btn-primary"
                    >
                        Go to Dashboard
                        <ArrowRight size={18} />
                    </button>
                </div>
            )}
        </div>
    );
}
