'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setTokens } from '@/lib/api';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { ThemedLogo } from '@/components/ThemedLogo';

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
            <form onSubmit={handleLogin} style={{
                width: '100%',
                maxWidth: '400px',
                padding: 'var(--space-xl)',
                position: 'relative',
                zIndex: 1
            }}>
                <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-md)' }}>
                        <ThemedLogo height={26} />
                        <span className="sidebar-badge">Admin</span>
                    </div>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                        Sign in to the admin panel
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
                        border: '1px solid transparent'
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
                        placeholder="you@thravic.com"
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
