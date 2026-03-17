'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Cookie, X } from 'lucide-react';

const CONSENT_KEY = '_tf_cookie_consent';

type ConsentState = 'pending' | 'accepted' | 'rejected';

export default function CookieConsentBanner() {
    const [consent, setConsent] = useState<ConsentState>('accepted'); // default to accepted to avoid flash

    useEffect(() => {
        const stored = localStorage.getItem(CONSENT_KEY);
        if (!stored) {
            setConsent('pending');
        } else {
            setConsent(stored as ConsentState);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem(CONSENT_KEY, 'accepted');
        setConsent('accepted');
    };

    const handleReject = () => {
        localStorage.setItem(CONSENT_KEY, 'rejected');
        setConsent('rejected');
    };

    if (consent !== 'pending') return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 48px)',
            maxWidth: '640px',
            background: 'rgba(15, 15, 20, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            padding: '20px 24px',
            zIndex: 9999,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            animation: 'slideUp 0.4s ease-out',
        }}>
            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: 'rgba(245, 158, 11, 0.12)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    <Cookie size={18} color="#f59e0b" />
                </div>

                <div style={{ flex: 1 }}>
                    <p style={{
                        fontSize: '0.875rem', color: 'var(--color-text-secondary)',
                        lineHeight: 1.6, margin: '0 0 16px',
                    }}>
                        We use cookies and similar technologies to improve your experience and analyze site traffic.
                        By clicking &ldquo;Accept,&rdquo; you consent to analytics cookies.{' '}
                        <Link href="/cookies" style={{ color: 'var(--color-accent-primary)', textDecoration: 'underline' }}>
                            Learn more
                        </Link>
                    </p>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button onClick={handleAccept} style={{
                            padding: '8px 20px', borderRadius: '8px', border: 'none',
                            background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)',
                            fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                            transition: 'opacity 0.2s',
                        }} onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
                           onMouseOut={e => e.currentTarget.style.opacity = '1'}>
                            Accept All
                        </button>
                        <button onClick={handleReject} style={{
                            padding: '8px 20px', borderRadius: '8px',
                            border: '1px solid var(--color-border)', background: 'transparent',
                            color: 'var(--color-text-secondary)', fontSize: '0.8125rem',
                            fontWeight: 500, cursor: 'pointer', transition: 'color 0.2s',
                        }} onMouseOver={e => e.currentTarget.style.color = 'var(--color-text-primary)'}
                           onMouseOut={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}>
                            Reject Non-Essential
                        </button>
                    </div>
                </div>

                <button onClick={handleReject} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-muted)', padding: '4px', flexShrink: 0,
                }}>
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
