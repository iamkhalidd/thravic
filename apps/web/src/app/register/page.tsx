'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart3, Mail, Lock, User, ArrowRight } from 'lucide-react';
import { auth } from '@/lib/api';

export default function RegisterPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await auth.register(formData.email, formData.password, formData.name);

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
                    <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-sm)' }}>Create your account</h2>
                    <p style={{ textAlign: 'center', marginBottom: 'var(--space-xl)', fontSize: '0.875rem' }}>
                        Start tracking your traffic for free
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                        <button
                            type="button"
                            onClick={() => window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/github`}
                            className="btn btn-secondary"
                            style={{ width: '100%', padding: '0.875rem' }}
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                            </svg>
                            Continue with GitHub
                        </button>

                        <button
                            type="button"
                            onClick={() => window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/google`}
                            className="btn btn-secondary"
                            style={{ width: '100%', padding: '0.875rem' }}
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="M12 8v8"></path>
                                <path d="M8 12h8"></path>
                            </svg>
                            Continue with Google
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                        <div style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or continue with email</span>
                        <div style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
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

                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                            <label style={{
                                display: 'block',
                                marginBottom: 'var(--space-xs)',
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)'
                            }}>
                                Full Name
                            </label>
                            <div style={{ position: 'relative' }}>
                                <User size={18} style={{
                                    position: 'absolute',
                                    left: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--color-text-muted)'
                                }} />
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="John Doe"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    style={{ paddingLeft: '40px' }}
                                    required
                                />
                            </div>
                        </div>

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
                            <label style={{
                                display: 'block',
                                marginBottom: 'var(--space-xs)',
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)'
                            }}>
                                Password
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
                                    placeholder="Min 8 characters"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    style={{ paddingLeft: '40px' }}
                                    minLength={8}
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
                            {loading ? 'Creating account...' : 'Create Account'}
                            {!loading && <ArrowRight size={18} />}
                        </button>
                    </form>

                    <p style={{
                        textAlign: 'center',
                        marginTop: 'var(--space-lg)',
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)'
                    }}>
                        Already have an account?{' '}
                        <Link href="/login" style={{ fontWeight: 500 }}>Sign in</Link>
                    </p>
                </div>

                <p style={{
                    textAlign: 'center',
                    marginTop: 'var(--space-lg)',
                    fontSize: '0.75rem',
                    color: 'var(--color-text-muted)'
                }}>
                    By creating an account, you agree to our Terms of Service and Privacy Policy
                </p>
            </div>
        </div>
    );
}
