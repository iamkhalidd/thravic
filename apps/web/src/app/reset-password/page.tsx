'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, Lock, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';
import { auth } from '@/lib/api';

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 8) {
            setError('Password must be at least 8 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (!token) {
            setError('Invalid or missing reset token. Please request a new reset link.');
            return;
        }

        setLoading(true);

        try {
            const result = await auth.resetPassword(token, password);

            if (result.error) {
                setError(result.error);
                setLoading(false);
                return;
            }

            setSuccess(true);
            setTimeout(() => router.push('/login'), 3000);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // No token in URL
    if (!token && !success) {
        return (
            <div className="card" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
                <div style={{
                    width: '56px', height: '56px', borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto var(--space-lg)',
                }}>
                    <AlertCircle size={28} style={{ color: 'var(--color-error)' }} />
                </div>
                <h2 style={{ marginBottom: 'var(--space-sm)' }}>Invalid Reset Link</h2>
                <p style={{
                    fontSize: '0.875rem',
                    color: 'var(--color-text-secondary)',
                    marginBottom: 'var(--space-lg)',
                    lineHeight: 1.6,
                }}>
                    This password reset link is invalid or has expired.
                    Please request a new one.
                </p>
                <Link href="/forgot-password" className="btn btn-primary" style={{
                    display: 'inline-flex', padding: '0.75rem 1.5rem',
                    textDecoration: 'none',
                }}>
                    Request New Link
                </Link>
            </div>
        );
    }

    return (
        <div className="card" style={{ padding: 'var(--space-xl)' }}>
            {success ? (
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
                    <h2 style={{ marginBottom: 'var(--space-sm)' }}>Password Updated!</h2>
                    <p style={{
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-lg)',
                        lineHeight: 1.6,
                    }}>
                        Your password has been successfully reset.
                        Redirecting you to sign in...
                    </p>
                    <Link href="/login" className="btn btn-primary" style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        padding: '0.75rem 1.5rem', textDecoration: 'none',
                    }}>
                        Sign In Now <ArrowRight size={16} />
                    </Link>
                </div>
            ) : (
                /* Form state */
                <>
                    <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-sm)' }}>
                        Set new password
                    </h2>
                    <p style={{
                        textAlign: 'center',
                        marginBottom: 'var(--space-xl)',
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)',
                    }}>
                        Enter your new password below. Make it strong!
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
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                            <label style={{
                                display: 'block',
                                marginBottom: 'var(--space-xs)',
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)'
                            }}>
                                New Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{
                                    position: 'absolute',
                                    left: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--color-text-muted)'
                                }} />
                                <input
                                    type="password"
                                    className="input"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    style={{ paddingLeft: '40px' }}
                                    required
                                    minLength={8}
                                    autoFocus
                                />
                            </div>
                            <p style={{
                                fontSize: '0.75rem',
                                color: 'var(--color-text-muted)',
                                marginTop: '4px',
                            }}>
                                Must be at least 8 characters
                            </p>
                        </div>

                        <div style={{ marginBottom: 'var(--space-lg)' }}>
                            <label style={{
                                display: 'block',
                                marginBottom: 'var(--space-xs)',
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)'
                            }}>
                                Confirm Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{
                                    position: 'absolute',
                                    left: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--color-text-muted)'
                                }} />
                                <input
                                    type="password"
                                    className="input"
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    style={{ paddingLeft: '40px' }}
                                    required
                                    minLength={8}
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
                            }}
                        >
                            {loading ? 'Resetting...' : 'Reset Password'}
                            {!loading && <ArrowRight size={18} />}
                        </button>
                    </form>
                </>
            )}
        </div>
    );
}

export default function ResetPasswordPage() {
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
                    <BarChart3 size={32} style={{ color: 'var(--color-accent-primary)' }} />
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Thravic</span>
                </Link>

                <Suspense fallback={
                    <div className="card" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
                        <p style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>
                    </div>
                }>
                    <ResetPasswordForm />
                </Suspense>
            </div>
        </div>
    );
}
