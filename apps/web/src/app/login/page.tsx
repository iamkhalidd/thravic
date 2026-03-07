'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart3, Mail, Lock, ArrowRight } from 'lucide-react';
import { auth } from '@/lib/api';

export default function LoginPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await auth.login(formData.email, formData.password);

        if (result.error) {
            setError(result.error);
            setLoading(false);
            return;
        }

        router.push('/dashboard');
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
                    <BarChart3 size={32} style={{ color: 'var(--color-accent-primary)' }} />
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Thravic</span>
                </Link>

                {/* Card */}
                <div className="card" style={{ padding: 'var(--space-xl)' }}>
                    <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-sm)' }}>Welcome back</h2>
                    <p style={{ textAlign: 'center', marginBottom: 'var(--space-xl)', fontSize: '0.875rem' }}>
                        Sign in to access your dashboard
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
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    style={{ paddingLeft: '40px' }}
                                    required
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: 'var(--space-lg)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
                                <label style={{
                                    fontSize: '0.875rem',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    Password
                                </label>
                                <Link href="/forgot-password" style={{ fontSize: '0.875rem' }}>
                                    Forgot password?
                                </Link>
                            </div>
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
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    style={{ paddingLeft: '40px' }}
                                    required
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
                                fontSize: '1rem'
                            }}
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                            {!loading && <ArrowRight size={18} />}
                        </button>
                    </form>

                    <p style={{
                        textAlign: 'center',
                        marginTop: 'var(--space-lg)',
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)'
                    }}>
                        Don&apos;t have an account?{' '}
                        <Link href="/register" style={{ fontWeight: 500 }}>Sign up free</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
