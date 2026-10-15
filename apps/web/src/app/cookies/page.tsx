'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, Cookie, HardDrive, Globe, Users, Trash2, Bell } from 'lucide-react';

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
    code: { fontFamily: 'var(--font-mono, monospace)', fontSize: '0.875em', color: 'var(--color-text-primary)' },
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
                    <p style={s.subtitle}>Last Updated: October 15, 2026</p>
                </header>

                {/* Short version */}
                <div style={s.card}>
                    <h2 style={{ ...s.h2, marginBottom: '12px' }}><Shield size={24} color="#34B1AA" /> The short version</h2>
                    <p style={{ ...s.p, marginBottom: 0 }}>
                        Thravic does not use cookies. Not on thravic.com, not in the dashboard and not in the tracker that runs on our customers&rsquo; websites. We keep a few small values in your browser&rsquo;s own storage instead, and this page lists every one of them.
                    </p>
                </div>

                {/* 1. Cookies and browser storage */}
                <section style={s.section}>
                    <h2 style={s.h2}><Cookie size={24} color="#f59e0b" /> 1. Cookies and browser storage</h2>
                    <p style={s.p}>
                        Cookies are small files a website saves in your browser. They are sent back to the website with every request, and they are often used to follow people across different sites.
                    </p>
                    <p style={s.p}>
                        Browser storage (called local storage and session storage) also keeps small values in your browser, but it stays on your device. It is never sent anywhere on its own, and one website cannot read another website&rsquo;s storage. Session storage is cleared when you close the tab.
                    </p>
                    <p style={s.p}>
                        This policy should be read alongside our <Link href="/privacy" style={{ color: 'var(--color-accent-primary)', textDecoration: 'underline' }}>Privacy Policy</Link>.
                    </p>
                </section>

                {/* 2. Thravic website and dashboard */}
                <section style={s.section}>
                    <h2 style={s.h2}><HardDrive size={24} color="var(--color-accent-primary)" /> 2. On thravic.com and the dashboard</h2>
                    <p style={s.p}>When you use our website or dashboard, we keep these values in your browser:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}><strong>Sign-in:</strong> <code style={s.code}>accessToken</code> and <code style={s.code}>refreshToken</code> keep you signed in. They are removed when you sign out.</li>
                        <li style={s.listItem}><strong>Settings:</strong> <code style={s.code}>theme</code> (light or dark), <code style={s.code}>tf_sidebar_collapsed</code> (sidebar open or closed) and <code style={s.code}>tf_live</code> (Live view settings).</li>
                        <li style={s.listItem}><strong>Ask Thravic:</strong> your chat with the assistant is kept in session storage for that tab only, so it is gone when you close the tab.</li>
                        <li style={s.listItem}><strong>Support access:</strong> when our team views an account to help with a problem, a note of this is kept in session storage for that tab.</li>
                    </ul>
                    <p style={s.p}>None of these are used for advertising, and none of them follow you to other websites.</p>
                </section>

                {/* 3. Tracker */}
                <section style={s.section}>
                    <h2 style={s.h2}><Users size={24} color="var(--color-accent-primary)" /> 3. On websites that use Thravic</h2>
                    <p style={s.p}>
                        Our customers add the Thravic tracker to their own websites to count visits. The tracker sets no cookies. It keeps these values in the visitor&rsquo;s browser, on that website only:
                    </p>
                    <ul style={s.list}>
                        <li style={s.listItem}><strong>Visitor ID</strong> (<code style={s.code}>_tf_vid</code>): a random ID, so a returning visitor is not counted twice. It contains no name, email or other personal detail.</li>
                        <li style={s.listItem}><strong>Visit ID</strong> (<code style={s.code}>_tf_sid</code>): a random ID for the current visit, so pages viewed in one visit are grouped together.</li>
                        <li style={s.listItem}><strong>Waiting events</strong> (<code style={s.code}>_tf_queue</code>): events that could not be sent yet, for example while the visitor was offline. They are sent and removed once the connection is back.</li>
                        <li style={s.listItem}><strong>Consent answers</strong> (<code style={s.code}>_tf_consent</code>, <code style={s.code}>_tf_rec_consent</code>): the visitor&rsquo;s answer when a website asks for permission, so they are not asked again.</li>
                        <li style={s.listItem}><strong>Session recording</strong> (<code style={s.code}>_tf_rec</code>, <code style={s.code}>_tf_rec_sample</code>): only when the website owner has turned recording on. These remember whether the current visit is being recorded.</li>
                    </ul>
                    <p style={s.p}>
                        Because the values are kept per website, the tracker cannot follow a visitor from one website to another. Each website owner decides whether they need to ask visitors for permission under the laws that apply to them, and we give them the tools to do so.
                    </p>
                </section>

                {/* 4. Other companies */}
                <section style={s.section}>
                    <h2 style={s.h2}><Globe size={24} color="#34B1AA" /> 4. Other companies</h2>
                    <ul style={s.list}>
                        <li style={s.listItem}><strong>Google Fonts:</strong> our pages load their fonts from Google. Like any web request, this sends your IP address to Google, but Google Fonts sets no cookies.</li>
                        <li style={s.listItem}><strong>Google and GitHub sign-in:</strong> if you choose to sign in with Google or GitHub, you are sent to their website for a moment. They may set their own cookies on their own website, under their own policies.</li>
                        <li style={s.listItem}><strong>Paystack:</strong> when you pay for a plan, the payment happens on Paystack. Paystack may set its own cookies on its own website, under its own policy.</li>
                    </ul>
                    <p style={s.p}>We do not use advertising networks, social media buttons or any other third-party trackers.</p>
                </section>

                {/* 5. Clearing */}
                <section style={s.section}>
                    <h2 style={s.h2}><Trash2 size={24} color="#ef4444" /> 5. How to clear it</h2>
                    <p style={s.p}>
                        You can remove everything listed here at any time by clearing your browser&rsquo;s site data, usually found under &ldquo;Cookies and site data&rdquo; in your browser settings. Private or incognito windows clear it automatically when closed.
                    </p>
                    <p style={s.p}>
                        If you clear it on thravic.com you will be signed out and your settings will go back to the defaults. If you clear it on a website that uses Thravic, your next visit is simply counted as a new visitor.
                    </p>
                </section>

                {/* 6. Updates */}
                <section style={s.section}>
                    <h2 style={s.h2}><Bell size={24} color="#f59e0b" /> 6. Changes to this policy</h2>
                    <p style={s.p}>If we ever change what we keep in your browser, we will update this page and the &ldquo;Last Updated&rdquo; date above.</p>
                </section>

                {/* 7. Contact */}
                <section style={s.section}>
                    <h2 style={s.h2}>7. Contact</h2>
                    <p style={s.p}>Questions about this policy? Contact us:</p>
                    <p style={{ ...s.p, fontWeight: 600 }}>Email: thravic247@gmail.com</p>
                </section>

                <footer style={{ marginTop: '80px', paddingTop: '40px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                        Questions about this policy? Contact us at thravic247@gmail.com
                    </p>
                </footer>
            </div>
        </div>
    );
}
