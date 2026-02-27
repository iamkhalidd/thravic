'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setTokens } from '@/lib/api';
import { Lock, Eye, EyeOff, Shield } from 'lucide-react';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const res = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Login failed');
            }

            // Verify admin role
            const meRes = await fetch(`${API_BASE}/api/admin/dashboard/stats`, {
                headers: { 'Authorization': `Bearer ${data.accessToken}` },
            });

            if (meRes.status === 403) {
                throw new Error('Access denied. Admin privileges required.');
            }

            setTokens(data.accessToken, data.refreshToken);
            router.push('/');
        } catch (err: any) {
            setError(err.message);
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
            background: 'var(--color-bg-primary)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Background decoration */}
            <div style={{
                position: 'absolute',
                width: '600px', height: '600px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(108,92,231,0.08) 0%, transparent 70%)',
                top: '-200px', right: '-200px'
            }} />
            <div style={{
                position: 'absolute',
                width: '400px', height: '400px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(162,155,254,0.06) 0%, transparent 70%)',
                bottom: '-100px', left: '-100px'
            }} />

            <form onSubmit={handleLogin} style={{
                width: '100%',
                maxWidth: '400px',
                padding: 'var(--space-xl)',
                position: 'relative',
                zIndex: 1
            }}>
                {/* Logo area */}
                <div style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
                    <div style={{
                        width: '56px', height: '56px',
                        borderRadius: '16px',
                        background: 'var(--color-accent-bg)',
                        border: '1px solid rgba(108,92,231,0.25)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 'var(--space-md)'
                    }}>
                        <Shield size={28} color="var(--color-accent)" />
                    </div>
                    <h1 style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, var(--color-accent), #a29bfe)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        marginBottom: '4px'
                    }}>
                        TrackFlow Admin
                    </h1>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
                        Sign in to access the admin panel
                    </p>
                </div>

                {error && (
                    <div style={{
                        background: 'var(--color-danger-bg)',
                        color: 'var(--color-danger)',
                        padding: 'var(--space-md)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '13px',
                        marginBottom: 'var(--space-lg)',
                        border: '1px solid rgba(255,71,87,0.2)'
                    }}>
                        {error}
                    </div>
                )}

                <div style={{ marginBottom: 'var(--space-md)' }}>
                    <label style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--color-text-secondary)',
                        marginBottom: '6px'
                    }}>
                        Email
                    </label>
                    <input
                        className="input"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@trackflow.io"
                        required
                    />
                </div>

                <div style={{ marginBottom: 'var(--space-lg)' }}>
                    <label style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--color-text-secondary)',
                        marginBottom: '6px'
                    }}>
                        Password
                    </label>
                    <div style={{ position: 'relative' }}>
                        <input
                            className="input"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{
                                position: 'absolute',
                                right: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--color-text-muted)'
                            }}
                        >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>

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
                        opacity: loading ? 0.7 : 1
                    }}
                >
                    {loading ? (
                        <>
                            <div className="spinner" style={{ width: '16px', height: '16px' }} />
                            Signing in...
                        </>
                    ) : (
                        <>
                            <Lock size={16} />
                            Sign In
                        </>
                    )}
                </button>

                <p style={{
                    textAlign: 'center',
                    marginTop: 'var(--space-lg)',
                    fontSize: '12px',
                    color: 'var(--color-text-muted)'
                }}>
                    Only admin accounts can access this panel
                </p>
            </form>
        </div>
    );
}
