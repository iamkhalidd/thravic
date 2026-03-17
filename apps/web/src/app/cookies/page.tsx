'use client';

import React from 'react';
import Link from 'next/link';
import { BarChart3, ArrowLeft, Shield, Lock, Cookie, Eye, Bell, Users, Settings, AlertTriangle } from 'lucide-react';

const s = {
    page: { minHeight: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', padding: '80px 24px' },
    container: { maxWidth: '800px', margin: '0 auto' },
    header: { marginBottom: '64px', textAlign: 'center' as const },
    h1: { fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 600, letterSpacing: '-0.04em', marginBottom: '16px' },
    subtitle: { fontSize: '1.125rem', color: 'var(--color-text-secondary)', maxWidth: '600px', margin: '0 auto' },
    section: { marginBottom: '48px' },
    h2: { fontSize: '1.5rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' },
    h3: { fontSize: '1.125rem', fontWeight: 600, marginBottom: '12px', color: 'var(--color-text-primary)' },
    p: { fontSize: '1rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: '20px' },
    list: { paddingLeft: '24px', marginBottom: '20px' },
    listItem: { color: 'var(--color-text-secondary)', marginBottom: '12px', lineHeight: 1.7 },
    card: { background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '32px', marginBottom: '48px' },
    badge: { display: 'inline-block', padding: '4px 12px', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: 500, marginTop: '8px' },
};

export default function CookiePolicyPage() {
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
                        <Cookie size={24} style={{ color: 'var(--color-bg-primary)' }} />
                    </div>
                    <h1 style={s.h1}>Cookie Policy</h1>
                    <p style={s.subtitle}>Last Updated: March 17, 2026</p>
                </header>

                {/* 1. Introduction */}
                <section style={s.section}>
                    <h2 style={s.h2}><BarChart3 size={24} color="#34B1AA" /> 1. Introduction</h2>
                    <p style={s.p}>
                        This Cookie Policy explains how Thravic (&ldquo;Thravic,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) uses cookies and similar tracking technologies in connection with our website and analytics services (the &ldquo;Services&rdquo;).
                    </p>
                    <p style={s.p}>
                        It also explains how website visitors (&ldquo;Users&rdquo;) can control and manage their cookie preferences.
                    </p>
                    <p style={s.p}>
                        This policy should be read alongside our <Link href="/privacy" style={{ color: 'var(--color-accent-primary)', textDecoration: 'underline' }}>Privacy Policy</Link>.
                    </p>
                </section>

                {/* 2. What Are Cookies? */}
                <section style={s.section}>
                    <h2 style={s.h2}><Cookie size={24} color="#f59e0b" /> 2. What Are Cookies?</h2>
                    <p style={s.p}>
                        Cookies are small text files stored on a user&rsquo;s device (computer, tablet, or mobile) when visiting a website.
                    </p>
                    <p style={s.p}>Cookies are widely used to:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Enable core website functionality</li>
                        <li style={s.listItem}>Improve user experience</li>
                        <li style={s.listItem}>Analyze website traffic and performance</li>
                    </ul>
                    <p style={s.p}>In addition to cookies, we may use similar technologies such as:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Local storage</li>
                        <li style={s.listItem}>Session storage</li>
                        <li style={s.listItem}>Tracking scripts</li>
                    </ul>
                </section>

                {/* 3. How Thravic Uses Cookies */}
                <section style={s.section}>
                    <h2 style={s.h2}><Shield size={24} color="#34B1AA" /> 3. How Thravic Uses Cookies</h2>
                    <p style={s.p}>Thravic uses cookies in a privacy-first and minimal manner, strictly for analytics and service functionality.</p>
                    <p style={s.p}><strong>We do not use cookies for:</strong></p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Advertising</li>
                        <li style={s.listItem}>Behavioral profiling across unrelated websites</li>
                        <li style={s.listItem}>Selling user data</li>
                    </ul>
                </section>

                {/* 4. Types of Cookies */}
                <section style={s.section}>
                    <h2 style={s.h2}><Settings size={24} color="var(--color-accent-primary)" /> 4. Types of Cookies We Use</h2>

                    <div style={s.card}>
                        <h3 style={s.h3}>4.1 Strictly Necessary Cookies</h3>
                        <p style={s.p}>These cookies are essential for the operation of the Services. They enable core functionality such as:</p>
                        <ul style={s.list}>
                            <li style={s.listItem}>Secure access to dashboards</li>
                            <li style={s.listItem}>Session management</li>
                            <li style={s.listItem}>Fraud prevention and system integrity</li>
                        </ul>
                        <span style={{ ...s.badge, background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>No consent required</span>
                    </div>

                    <div style={s.card}>
                        <h3 style={s.h3}>4.2 Analytics Cookies</h3>
                        <p style={s.p}>These cookies help us and our Customers understand how users interact with websites. They may collect:</p>
                        <ul style={s.list}>
                            <li style={s.listItem}>Page visits and session duration</li>
                            <li style={s.listItem}>Click behavior and navigation flows</li>
                            <li style={s.listItem}>Traffic sources (e.g., search, social, direct)</li>
                        </ul>
                        <p style={s.p}>These cookies are used to improve website performance, identify usability issues, and optimize user experience.</p>
                        <p style={s.p}><strong>Important:</strong> Data collected is minimized and anonymized where possible. No cross-site tracking is performed.</p>
                        <span style={{ ...s.badge, background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>Consent required where applicable</span>
                    </div>

                    <div style={s.card}>
                        <h3 style={s.h3}>4.3 Functional Cookies</h3>
                        <p style={s.p}>These cookies enhance usability by remembering user preferences such as:</p>
                        <ul style={s.list}>
                            <li style={s.listItem}>Language settings</li>
                            <li style={s.listItem}>UI preferences</li>
                            <li style={s.listItem}>Consent choices</li>
                        </ul>
                        <span style={{ ...s.badge, background: 'rgba(52,177,170,0.1)', color: '#34B1AA' }}>Legitimate interest or consent</span>
                    </div>
                </section>

                {/* 5. Third-Party Cookies */}
                <section style={s.section}>
                    <h2 style={s.h2}>5. Third-Party Cookies</h2>
                    <p style={s.p}>Thravic does not use third-party cookies for advertising or marketing.</p>
                    <p style={s.p}>However, limited third-party services (e.g., hosting or infrastructure providers) may support our platform. These providers are:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Bound by strict data protection agreements</li>
                        <li style={s.listItem}>Not permitted to use data for their own purposes</li>
                    </ul>
                </section>

                {/* 6. Cookie Duration */}
                <section style={s.section}>
                    <h2 style={s.h2}>6. Cookie Duration</h2>
                    <p style={s.p}>Cookies may be classified based on how long they remain on a device:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}><strong>Session Cookies:</strong> Deleted when the browser is closed</li>
                        <li style={s.listItem}><strong>Persistent Cookies:</strong> Remain for a defined period or until manually deleted</li>
                    </ul>
                    <p style={s.p}>Retention periods are kept as short as necessary.</p>
                </section>

                {/* 7. Consent and Control */}
                <section style={s.section}>
                    <h2 style={s.h2}><Eye size={24} color="var(--color-accent-primary)" /> 7. Consent and Control</h2>

                    <h3 style={s.h3}>7.1 Cookie Consent</h3>
                    <p style={s.p}>In compliance with GDPR and the ePrivacy Directive:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Non-essential cookies (e.g., analytics) are only set <strong>after user consent</strong></li>
                        <li style={s.listItem}>Users are presented with a cookie banner or consent management tool (implemented by Customers)</li>
                    </ul>

                    <h3 style={s.h3}>7.2 Managing Cookies</h3>
                    <p style={s.p}>Users can control or disable cookies through:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Browser settings (e.g., block or delete cookies)</li>
                        <li style={s.listItem}>Consent banners on websites using Thravic</li>
                        <li style={s.listItem}>Privacy-focused browser extensions</li>
                    </ul>

                    <h3 style={s.h3}>7.3 Do Not Track (DNT)</h3>
                    <p style={s.p}>Thravic respects browser-based &ldquo;Do Not Track&rdquo; (DNT) signals where technically feasible.</p>
                </section>

                {/* 8. Impact of Disabling Cookies */}
                <section style={s.section}>
                    <h2 style={s.h2}><AlertTriangle size={24} color="#ef4444" /> 8. Impact of Disabling Cookies</h2>
                    <p style={s.p}>If cookies are disabled:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Some parts of a website may not function properly</li>
                        <li style={s.listItem}>Analytics data may be limited or unavailable</li>
                        <li style={s.listItem}>User experience may be affected</li>
                    </ul>
                </section>

                {/* 9. Responsibilities of Customers */}
                <section style={s.section}>
                    <h2 style={s.h2}><Users size={24} color="var(--color-accent-primary)" /> 9. Responsibilities of Customers</h2>
                    <p style={s.p}>As Thravic acts as a data processor, Customers (website owners) are responsible for:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Displaying cookie consent banners</li>
                        <li style={s.listItem}>Obtaining valid user consent where required</li>
                        <li style={s.listItem}>Providing clear cookie disclosures in their own privacy policies</li>
                    </ul>
                </section>

                {/* 10. Updates */}
                <section style={s.section}>
                    <h2 style={s.h2}><Bell size={24} color="#f59e0b" /> 10. Updates to This Cookie Policy</h2>
                    <p style={s.p}>We may update this Cookie Policy periodically to reflect:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Changes in legal requirements</li>
                        <li style={s.listItem}>Updates to our Services</li>
                        <li style={s.listItem}>Improvements in our data practices</li>
                    </ul>
                    <p style={s.p}>Changes will be indicated by updating the &ldquo;Last Updated&rdquo; date.</p>
                </section>

                {/* 11. Contact */}
                <section style={s.section}>
                    <h2 style={s.h2}>11. Contact Information</h2>
                    <p style={s.p}>For questions about this Cookie Policy or our data practices, contact:</p>
                    <p style={{ ...s.p, fontWeight: 600 }}>Email: thravic247@gmail.com</p>
                </section>

                {/* 12. Final Statement */}
                <div style={s.card}>
                    <h2 style={{ ...s.h2, marginBottom: '12px' }}><Shield size={24} color="#34B1AA" /> 12. Final Statement</h2>
                    <p style={{ ...s.p, marginBottom: 0 }}>
                        Thravic is designed with a privacy-first approach, ensuring that analytics insights are delivered responsibly, transparently, and in full respect of user choice and regulatory requirements.
                    </p>
                </div>

                <footer style={{ marginTop: '80px', paddingTop: '40px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                        Questions about our cookie practices? Contact us at thravic247@gmail.com
                    </p>
                </footer>
            </div>
        </div>
    );
}
