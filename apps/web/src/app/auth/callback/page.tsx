'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, Loader } from 'lucide-react';

function CallbackHandler() {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const accessToken = searchParams.get('accessToken');
        const refreshToken = searchParams.get('refreshToken');
        const error = searchParams.get('error');

        if (error) {
            router.replace(`/login?error=${error}`);
            return;
        }

        if (accessToken && refreshToken) {
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            router.replace('/dashboard');
        } else {
            router.replace('/login?error=missing_tokens');
        }
    }, [searchParams, router]);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-bg-primary)',
            gap: 'var(--space-lg)',
        }}>
            <BarChart3 size={40} style={{ color: 'var(--color-accent-primary)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Loader size={20} className="spin" style={{ color: 'var(--color-text-secondary)' }} />
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    Signing you in...
                </span>
            </div>
        </div>
    );
}

export default function AuthCallbackPage() {
    return (
        <Suspense fallback={
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-bg-primary)',
            }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Loading...</span>
            </div>
        }>
            <CallbackHandler />
        </Suspense>
    );
}
