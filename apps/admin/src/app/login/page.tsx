'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { CSRF_HEADERS } from '@/lib/api';
import { Lock, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';
import { ThemedLogo } from '@/components/ThemedLogo';

// Sign-in has three screens: password, then either the app code (set up
// already) or the one-time setup (scan the key and enter the emailed code).
type Step =
    | { name: 'password' }
    | { name: 'code'; ticket: string }
    | { name: 'setup'; ticket: string; secret: string; otpauthUrl: string };

const REASONS: Record<string, string> = {
    expired: 'Your admin session ended. Sign in again.',
    idle: 'You were signed out after 30 minutes without activity.',
};

async function post(path: string, body: unknown) {
    const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...CSRF_HEADERS },
        body: JSON.stringify(body),
        credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Sign-in failed');
    return data;
}

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    marginBottom: '6px',
};

function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
    return (
        <input
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            autoFocus={autoFocus}
            required
            style={{ letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }}
        />
    );
}

export default function AdminLogin() {
    const [step, setStep] = useState<Step>({ name: 'password' });
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [code, setCode] = useState('');
    const [emailCode, setEmailCode] = useState('');
    const [qr, setQr] = useState('');
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const reason = new URLSearchParams(window.location.search).get('reason');
        if (reason && REASONS[reason]) setNotice(REASONS[reason]);
    }, []);

    useEffect(() => {
        if (step.name !== 'setup') return;
        QRCode.toDataURL(step.otpauthUrl, { margin: 1, width: 180 }).then(setQr).catch(() => setQr(''));
    }, [step]);

    const run = async (work: () => Promise<void>) => {
        setError('');
        setLoading(true);
        try {
            await work();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const submitPassword = (e: React.FormEvent) => {
        e.preventDefault();
        run(async () => {
            const data = await post('/api/session/login', { email, password });
            setPassword('');
            setCode('');
            setNotice('');
            setStep(data.step === 'setup'
                ? { name: 'setup', ticket: data.ticket, secret: data.secret, otpauthUrl: data.otpauthUrl }
                : { name: 'code', ticket: data.ticket });
        });
    };

    const submitCode = (e: React.FormEvent) => {
        e.preventDefault();
        if (step.name === 'password') return;
        run(async () => {
            await post('/api/session/verify', {
                ticket: step.ticket,
                code,
                ...(step.name === 'setup' ? { emailCode } : {}),
            });
            router.push('/');
        });
    };

    const startOver = () => {
        setStep({ name: 'password' });
        setCode('');
        setEmailCode('');
        setError('');
    };

    const submitLabel = step.name === 'password' ? 'Continue' : step.name === 'setup' ? 'Turn on and sign in' : 'Sign in';

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-bg-primary)',
        }}>
            <form onSubmit={step.name === 'password' ? submitPassword : submitCode} style={{
                width: '100%',
                maxWidth: '400px',
                padding: 'var(--space-xl)',
            }}>
                <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-md)' }}>
                        <ThemedLogo height={26} />
                        <span className="sidebar-badge">Admin</span>
                    </div>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                        {step.name === 'password' && 'Sign in to the admin panel'}
                        {step.name === 'code' && 'Enter the 6-digit code from your authenticator app'}
                        {step.name === 'setup' && 'Set up two-step sign-in. You only do this once.'}
                    </p>
                </div>

                {notice && !error && (
                    <div style={{
                        background: 'var(--color-bg-tertiary)',
                        color: 'var(--color-text-secondary)',
                        padding: 'var(--space-md)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '13px',
                        marginBottom: 'var(--space-lg)',
                    }}>
                        {notice}
                    </div>
                )}

                {error && (
                    <div role="alert" style={{
                        background: 'var(--color-danger-bg)',
                        color: 'var(--color-danger)',
                        padding: 'var(--space-md)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '13px',
                        marginBottom: 'var(--space-lg)',
                    }}>
                        {error}
                    </div>
                )}

                {step.name === 'password' && (
                    <>
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                            <label style={labelStyle} htmlFor="email">Email</label>
                            <input
                                id="email"
                                className="input"
                                type="email"
                                autoComplete="username"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@thravic.com"
                                required
                            />
                        </div>
                        <div style={{ marginBottom: 'var(--space-lg)' }}>
                            <label style={labelStyle} htmlFor="password">Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    id="password"
                                    className="input"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    style={{
                                        position: 'absolute',
                                        right: '12px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--color-text-muted)',
                                    }}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {step.name === 'setup' && (
                    <>
                        <ol style={{ fontSize: '13px', color: 'var(--color-text-secondary)', paddingLeft: 18, marginBottom: 'var(--space-md)', lineHeight: 1.6 }}>
                            <li>Open an authenticator app (Google Authenticator, 1Password, Authy) and scan this code.</li>
                            <li>Enter the code we just emailed you, and the 6-digit code the app shows.</li>
                        </ol>
                        <div style={{ textAlign: 'center', marginBottom: 'var(--space-md)' }}>
                            {qr && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={qr} alt="Authenticator setup QR code" width={180} height={180}
                                    style={{ background: '#fff', padding: 8, borderRadius: 'var(--radius-md)' }} />
                            )}
                            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: 8 }}>
                                Can&apos;t scan? Type this key into the app:
                            </p>
                            <code style={{ fontSize: '13px', wordBreak: 'break-all', userSelect: 'all' }}>
                                {step.secret.match(/.{1,4}/g)?.join(' ')}
                            </code>
                        </div>
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                            <label style={labelStyle} htmlFor="emailCode">Code from your email</label>
                            <input
                                id="emailCode"
                                className="input"
                                inputMode="numeric"
                                maxLength={6}
                                value={emailCode}
                                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="123456"
                                required
                                style={{ letterSpacing: '0.3em' }}
                            />
                        </div>
                    </>
                )}

                {step.name !== 'password' && (
                    <div style={{ marginBottom: 'var(--space-lg)' }}>
                        <label style={labelStyle}>Code from the app</label>
                        <CodeInput value={code} onChange={setCode} autoFocus={step.name === 'code'} />
                    </div>
                )}

                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                    style={{
                        width: '100%',
                        justifyContent: 'center',
                        padding: '12px',
                        fontSize: '15px',
                        fontWeight: 600,
                        opacity: loading ? 0.7 : 1,
                    }}
                >
                    {loading ? (
                        <>
                            <div className="spinner" style={{ width: '16px', height: '16px' }} />
                            Checking...
                        </>
                    ) : (
                        <>
                            {step.name === 'password' ? <Lock size={16} /> : <ShieldCheck size={16} />}
                            {submitLabel}
                        </>
                    )}
                </button>

                {step.name !== 'password' ? (
                    <button
                        type="button"
                        onClick={startOver}
                        className="btn btn-ghost"
                        style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-md)' }}
                    >
                        <ArrowLeft size={14} /> Use a different account
                    </button>
                ) : (
                    <p style={{
                        textAlign: 'center',
                        marginTop: 'var(--space-lg)',
                        fontSize: '12px',
                        color: 'var(--color-text-muted)',
                    }}>
                        Only admin accounts can access this panel
                    </p>
                )}
            </form>
        </div>
    );
}
