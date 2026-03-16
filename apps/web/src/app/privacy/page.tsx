'use client';

import React from 'react';
import Link from 'next/link';
import { BarChart3, ArrowLeft, Shield, Lock, Eye, FileText } from 'lucide-react';

const s = {
    page: { minHeight: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', padding: '80px 24px' },
    container: { maxWidth: '800px', margin: '0 auto' },
    header: { marginBottom: '64px', textAlign: 'center' as const },
    h1: { fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 600, letterSpacing: '-0.04em', marginBottom: '16px' },
    subtitle: { fontSize: '1.125rem', color: 'var(--color-text-secondary)', maxWidth: '600px', margin: '0 auto' },
    section: { marginBottom: '48px' },
    h2: { fontSize: '1.5rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' },
    p: { fontSize: '1rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: '20px' },
    list: { paddingLeft: '24px', marginBottom: '20px' },
    listItem: { color: 'var(--color-text-secondary)', marginBottom: '12px', lineHeight: 1.7 },
    card: { background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '32px', marginBottom: '48px' }
};

export default function PrivacyPage() {
    return (
        <div style={s.page}>
            <div className="linear-hero-grid" style={{ opacity: 0.3 }}></div>
            
            <div style={s.container}>
                <Link href="/" style={{ 
                    display: 'inline-flex', alignItems: 'center', gap: '8px', 
                    color: 'var(--color-text-secondary)', textDecoration: 'none', 
                    fontSize: '0.875rem', marginBottom: '40px', transition: 'color 0.2s' 
                }} onMouseOver={e => e.currentTarget.style.color = 'var(--color-text-primary)'} onMouseOut={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}>
                    <ArrowLeft size={16} /> Back to Home
                </Link>

                <header style={s.header}>
                    <div style={{
                        width: '48px', height: '48px', margin: '0 auto 24px', borderRadius: '12px',
                        background: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <BarChart3 size={24} style={{ color: 'var(--color-bg-primary)' }} />
                    </div>
                    <h1 style={s.h1}>Privacy Policy</h1>
                    <p style={s.subtitle}>Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </header>

                <div style={s.card}>
                    <h2 style={s.h2}><Shield size={24} color="#34B1AA" /> Our Role</h2>
                    <p style={s.p}>
                        Thravic operates as a <strong>third-party data processor</strong>. Our service is designed to help website owners ("Customers") understand their traffic patterns, visitor sources (such as Google, Instagram, or direct visits), and user interactions on their own digital properties.
                    </p>
                    <p style={s.p}>
                        All data collected through the Thravic tracking script is processed strictly on behalf of the Customer and is used exclusively for their internal analytics and site optimization purposes.
                    </p>
                </div>

                <section style={s.section}>
                    <h2 style={s.h2}><Eye size={24} color="var(--color-accent-primary)" /> Data Collection</h2>
                    <p style={s.p}>
                        To provide our analytics service, we collect limited information about visitors to our Customers' websites. This includes:
                    </p>
                    <ul style={s.list}>
                        <li style={s.listItem}><strong>Traffic Sources:</strong> Identifying the referral source (e.g., social media, search engines).</li>
                        <li style={s.listItem}><strong>Interaction Data:</strong> Click patterns, page views, and navigation flows.</li>
                        <li style={s.listItem}><strong>Device Information:</strong> Browser type, operating system, and screen resolution.</li>
                        <li style={s.listItem}><strong>Geographic Data:</strong> General location (country/city level) derived from IP addresses. Note: Full IP addresses are used for security and geo-lookup but are not stored indefinitely in a readable format.</li>
                    </ul>
                </section>

                <section style={s.section}>
                    <h2 style={s.h2}><Lock size={24} color="#f59e0b" /> Data Privacy & Security</h2>
                    <p style={s.p}>
                        We take data security seriously. Thravic does not sell user data to third parties, nor do we use it for advertising or cross-site tracking across different Customers.
                    </p>
                    <ul style={s.list}>
                        <li style={s.listItem}><strong>Encryption:</strong> All data is encrypted in transit and at rest.</li>
                        <li style={s.listItem}><strong>Anonymization:</strong> We prioritize visitor anonymity and minimize PII (Personally Identifiable Information) collection wherever possible.</li>
                        <li style={s.listItem}><strong>Strict Access:</strong> Access to raw data is limited to authorized personnel only when required for maintenance or troubleshooting.</li>
                    </ul>
                </section>

                <section style={s.section}>
                    <h2 style={s.h2}><FileText size={24} color="#ef4444" /> End-User Rights</h2>
                    <p style={s.p}>
                        Thravic is built with compliance in mind, supporting major privacy frameworks like GDPR and CCPA. End-users whose data is processed by Thravic have the right to:
                    </p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Request access to the data a site owner has collected about them.</li>
                        <li style={s.listItem}>Request the deletion of their analytics data.</li>
                        <li style={s.listItem}>Opt-out of tracking by using "Do Not Track" browser headers or site-specific opt-out controls provided by our Customers.</li>
                    </ul>
                </section>

                <footer style={{ marginTop: '80px', paddingTop: '40px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                        Questions about our privacy practices? Contact us at thravic247@gmail.com
                    </p>
                </footer>
            </div>
        </div>
    );
}
