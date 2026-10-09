'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ThemedLogo } from '@/components/ThemedLogo';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { auth } from '@/lib/api';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await auth.forgotPassword(email);

            if (result.error) {
                setError(result.error);
                setLoading(false);
                return;
            }

            setSent(true);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-bg-primary)'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '420px',
                padding: 'var(--space-lg)'
            }}>
                {/* Logo */}
                <Link href="/" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--space-sm)',
                    marginBottom: 'var(--space-xl)',
                    textDecoration: 'none'
                }}>
                    <ThemedLogo height={34} />
                </Link>

                {/* Card */}
                <div className="card" style={{ padding: 'var(--space-xl)' }}>
                    {sent ? (
                        /* Success state */
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                width: '56px', height: '56px', borderRadius: '50%',
                                background: 'rgba(34, 197, 94, 0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto var(--space-lg)',
                            }}>
                                <CheckCircle size={28} style={{ color: '#22c55e' }} />
                            </div>
                            <h2 style={{ marginBottom: 'var(--space-sm)' }}>Check your email</h2>
                            <p style={{
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)',
                                marginBottom: 'var(--space-lg)',
                                lineHeight: 1.6,
                            }}>
                                If an account exists for <strong style={{ color: 'var(--color-text-primary)' }}>{email}</strong>,
                                we&apos;ve sent a password reset link. It expires in 15 minutes.
                            </p>
                            <p style={{
                                fontSize: '0.8125rem',
                                color: 'var(--color-text-muted)',
                                marginBottom: 'var(--space-lg)',
                            }}>
                                Didn&apos;t receive it? Check your spam folder or try again.
                            </p>
                            <button
                                className="btn btn-ghost"
                                onClick={() => { setSent(false); setEmail(''); }}
                                style={{ width: '100%', marginBottom: 'var(--space-md)' }}
                            >
                                Try another email
                            </button>
                            <Link href="/login" style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '6px', fontSize: '0.875rem', color: 'var(--color-text-secondary)',
                            }}>
                                <ArrowLeft size={14} /> Back to sign in
                            </Link>
                        </div>
                    ) : (
                        /* Form state */
                        <>
                            <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-sm)' }}>
                                Reset your password
                            </h2>
                            <p style={{
                                textAlign: 'center',
                                marginBottom: 'var(--space-xl)',
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)',
                            }}>
                                Enter the email address associated with your account and we&apos;ll send you a link to reset your password.
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

                            <form onSubmit={handleSubmit}>
                                <div style={{ marginBottom: 'var(--space-lg)' }}>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: 'var(--space-xs)',
                                        fontSize: '0.875rem',
                                        color: 'var(--color-text-secondary)'
                                    }}>
                                        Email Address
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <Mail size={18} style={{
                                            position: 'absolute',
                                            left: '12px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            color: 'var(--color-text-muted)'
                                        }} />
                                        <input
                                            type="email"
                                            className="input"
                                            placeholder="you@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            style={{ paddingLeft: '40px' }}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={loading}
                                    style={{
                                        width: '100%',
                                        padding: '0.875rem',
                                        fontSize: '1rem',
                                        marginBottom: 'var(--space-lg)',
                                    }}
                                >
                                    {loading ? 'Sending...' : 'Send Reset Link'}
                                </button>
                            </form>

                            <div style={{ textAlign: 'center' }}>
                                <Link href="/login" style={{
                                    display: 'inline-flex', alignItems: 'center',
                                    gap: '6px', fontSize: '0.875rem',
                                    color: 'var(--color-text-secondary)',
                                }}>
                                    <ArrowLeft size={14} /> Back to sign in
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
