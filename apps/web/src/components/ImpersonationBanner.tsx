'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert, X } from 'lucide-react';

const ADMIN_PANEL_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3002';

/**
 * ImpersonationBanner
 *
 * On mount, checks for ?impersonate_token=<token> in the URL.
 * If found:
 *  - stores it in sessionStorage as the active auth token
 *  - cleans the URL
 *  - displays a persistent red banner so it's obvious you're in an admin session
 *
 * Clicking "Exit" clears the session token and redirects back to the admin panel.
 */
export function ImpersonationBanner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [impersonating, setImpersonating] = useState<string | null>(null);

    useEffect(() => {
        // 1. Check for token in URL (fresh impersonation)
        const tokenFromUrl = searchParams.get('impersonate_token');
        const emailFromUrl = searchParams.get('impersonate_email');

        if (tokenFromUrl) {
            // Store as active auth token for this session
            sessionStorage.setItem('token', tokenFromUrl);
            localStorage.removeItem('token'); // ensure normal token isn't used
            sessionStorage.setItem('impersonating_email', emailFromUrl ?? 'unknown');

            // Clean up the URL without triggering a navigation
            const cleanUrl = window.location.pathname;
            window.history.replaceState(null, '', cleanUrl);

            setImpersonating(emailFromUrl ?? 'unknown');
            return;
        }

        // 2. Check if we are already in an impersonation session
        const existingEmail = sessionStorage.getItem('impersonating_email');
        if (existingEmail) {
            setImpersonating(existingEmail);
        }
    }, [searchParams]);

    const handleExit = () => {
        // Clear impersonation session
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('impersonating_email');
        // Redirect back to admin panel
        window.location.href = `${ADMIN_PANEL_URL}/users`;
    };

    if (!impersonating) return null;

    return (
        <div
            role="alert"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.625rem 1.25rem',
                background: 'rgba(239,68,68,0.15)',
                borderBottom: '2px solid #ef4444',
                color: '#fca5a5',
                fontSize: '0.875rem',
                zIndex: 70,
                position: 'relative',
            }}
        >
            <ShieldAlert size={16} style={{ flexShrink: 0, color: '#f87171' }} />
            <span style={{ flex: 1 }}>
                <strong style={{ color: '#fca5a5' }}>Admin Session</strong>
                {' — '}Viewing as <strong>{impersonating}</strong>. Actions performed here affect this user&apos;s account.
            </span>
            <button
                onClick={handleExit}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.25rem 0.75rem',
                    background: 'rgba(239,68,68,0.25)',
                    border: '1px solid #ef4444',
                    borderRadius: '0.375rem',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                }}
            >
                <X size={14} /> Exit Session
            </button>
        </div>
    );
}
