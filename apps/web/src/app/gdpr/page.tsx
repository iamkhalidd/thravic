'use client';

import React from 'react';
import Link from 'next/link';
import { BarChart3, ArrowLeft, Shield, Lock, Eye, FileText, Globe, Users, Bell, Server, Cookie, Scale } from 'lucide-react';

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
    note: { background: 'rgba(52, 177, 170, 0.08)', border: '1px solid rgba(52, 177, 170, 0.2)', borderRadius: '8px', padding: '16px', marginBottom: '20px' },
};

export default function GdprPage() {
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
                        <Shield size={24} style={{ color: 'var(--color-bg-primary)' }} />
                    </div>
                    <h1 style={s.h1}>GDPR Compliance Statement</h1>
                    <p style={s.subtitle}>Last Updated: March 17, 2026</p>
                </header>

                {/* 1. Introduction */}
                <section style={s.section}>
                    <h2 style={s.h2}><BarChart3 size={24} color="#34B1AA" /> 1. Introduction</h2>
                    <p style={s.p}>
                        This GDPR Compliance Statement explains how Thravic complies with the General Data Protection Regulation (EU) 2016/679 (&ldquo;GDPR&rdquo;) when processing personal data.
                    </p>
                    <p style={s.p}>
                        Thravic is committed to protecting the privacy and rights of individuals within the European Economic Area (EEA) and ensuring lawful, fair, and transparent data processing practices.
                    </p>
                </section>

                {/* 2. Roles and Responsibilities */}
                <section style={s.section}>
                    <h2 style={s.h2}><Users size={24} color="var(--color-accent-primary)" /> 2. Roles and Responsibilities</h2>
                    <p style={s.p}>Under GDPR:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}><strong>Thravic</strong> acts as a Data Processor</li>
                        <li style={s.listItem}>Our <strong>Customers</strong> act as Data Controllers</li>
                    </ul>
                    <p style={s.p}>We process personal data only on behalf of and under the instructions of our Customers.</p>
                    <p style={s.p}>
                        For our customers&rsquo; own account details (name, email, date of birth, country and phone),
                        Thravic is the controller; the Privacy Policy (section 3.5) says what we keep and why.
                    </p>
                    <p style={s.p}>Customers are responsible for:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Determining the legal basis for processing</li>
                        <li style={s.listItem}>Obtaining user consent where required</li>
                        <li style={s.listItem}>Providing appropriate privacy notices to end-users</li>
                    </ul>
                </section>

                {/* 3. Lawful Basis */}
                <section style={s.section}>
                    <h2 style={s.h2}><Scale size={24} color="#f59e0b" /> 3. Lawful Basis for Processing</h2>
                    <p style={s.p}>Thravic processes personal data only where a lawful basis exists, including:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}><strong>Legitimate Interests</strong> &ndash; for analytics, performance monitoring, and service improvement</li>
                        <li style={s.listItem}><strong>Consent</strong> &ndash; where required (e.g., cookie consent banners implemented by Customers)</li>
                        <li style={s.listItem}><strong>Legal Obligations</strong> &ndash; where processing is necessary to comply with applicable laws</li>
                    </ul>
                </section>

                {/* 4. Data Protection Principles */}
                <section style={s.section}>
                    <h2 style={s.h2}><Shield size={24} color="#34B1AA" /> 4. Data Protection Principles</h2>
                    <p style={s.p}>Thravic adheres to the core GDPR principles:</p>
                    <div style={s.card}>
                        <h3 style={s.h3}>4.1 Lawfulness, Fairness, and Transparency</h3>
                        <p style={{ ...s.p, marginBottom: '24px' }}>We ensure all processing is lawful and transparent.</p>

                        <h3 style={s.h3}>4.2 Purpose Limitation</h3>
                        <p style={{ ...s.p, marginBottom: '24px' }}>Data is collected only for specific, explicit, and legitimate purposes (analytics and performance insights).</p>

                        <h3 style={s.h3}>4.3 Data Minimization</h3>
                        <p style={{ ...s.p, marginBottom: '24px' }}>We collect only the minimum amount of data necessary to provide our services.</p>

                        <h3 style={s.h3}>4.4 Accuracy</h3>
                        <p style={{ ...s.p, marginBottom: '24px' }}>We take reasonable steps to ensure data is accurate and up to date.</p>

                        <h3 style={s.h3}>4.5 Storage Limitation</h3>
                        <p style={{ ...s.p, marginBottom: '24px' }}>Data is retained only for as long as necessary and may be anonymized for long-term analytics.</p>

                        <h3 style={s.h3}>4.6 Integrity and Confidentiality</h3>
                        <p style={{ ...s.p, marginBottom: 0 }}>We protect data using strong security measures including encryption and access controls.</p>
                    </div>
                </section>

                {/* 5. Data Subject Rights */}
                <section style={s.section}>
                    <h2 style={s.h2}><FileText size={24} color="#ef4444" /> 5. Data Subject Rights</h2>
                    <p style={s.p}>Under GDPR, individuals have the following rights:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}><strong>Right of Access</strong> &ndash; to know what data is collected</li>
                        <li style={s.listItem}><strong>Right to Rectification</strong> &ndash; to correct inaccurate data</li>
                        <li style={s.listItem}><strong>Right to Erasure</strong> (&ldquo;Right to be Forgotten&rdquo;)</li>
                        <li style={s.listItem}><strong>Right to Restrict Processing</strong></li>
                        <li style={s.listItem}><strong>Right to Data Portability</strong></li>
                        <li style={s.listItem}><strong>Right to Object</strong> to Processing</li>
                        <li style={s.listItem}>Rights related to <strong>Automated Decision-Making</strong></li>
                    </ul>
                    <div style={s.note}>
                        <p style={{ ...s.p, marginBottom: 0, color: '#34B1AA' }}>
                            <strong>Important Note:</strong> Because Thravic acts as a Data Processor, requests should be directed to the relevant Customer (Data Controller). We assist Customers in fulfilling these rights where required.
                        </p>
                    </div>
                </section>

                {/* 6. Data Security Measures */}
                <section style={s.section}>
                    <h2 style={s.h2}><Lock size={24} color="#f59e0b" /> 6. Data Security Measures</h2>
                    <p style={s.p}>Thravic implements appropriate technical and organizational safeguards:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}><strong>Encryption (TLS/HTTPS)</strong> for data in transit</li>
                        <li style={s.listItem}><strong>Encrypted storage</strong> for data at rest</li>
                        <li style={s.listItem}><strong>Strict role-based access controls</strong></li>
                        <li style={s.listItem}><strong>Monitoring and threat detection</strong> systems</li>
                    </ul>
                </section>

                {/* 7. Data Breach Notification */}
                <section style={s.section}>
                    <h2 style={s.h2}><Bell size={24} color="#ef4444" /> 7. Data Breach Notification</h2>
                    <p style={s.p}>In the event of a personal data breach:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Thravic will notify affected Customers <strong>without undue delay</strong></li>
                        <li style={s.listItem}>Customers are responsible for notifying supervisory authorities and affected users where required</li>
                    </ul>
                </section>

                {/* 8. Sub-Processors */}
                <section style={s.section}>
                    <h2 style={s.h2}><Server size={24} color="var(--color-accent-primary)" /> 8. Sub-Processors</h2>
                    <p style={s.p}>Thravic may use trusted third-party service providers (sub-processors) such as:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Cloud hosting providers</li>
                        <li style={s.listItem}>Infrastructure and security services</li>
                    </ul>
                    <p style={s.p}>We ensure that all sub-processors:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Are GDPR-compliant</li>
                        <li style={s.listItem}>Are bound by Data Processing Agreements</li>
                        <li style={s.listItem}>Provide adequate safeguards for data protection</li>
                    </ul>
                </section>

                {/* 9. International Data Transfers */}
                <section style={s.section}>
                    <h2 style={s.h2}><Globe size={24} color="var(--color-accent-primary)" /> 9. International Data Transfers</h2>
                    <p style={s.p}>Where personal data is transferred outside the EEA, Thravic ensures appropriate safeguards, including:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Standard Contractual Clauses (SCCs)</li>
                        <li style={s.listItem}>Transfers to jurisdictions with adequate protection levels</li>
                    </ul>
                </section>

                {/* 10. Privacy by Design */}
                <section style={s.section}>
                    <h2 style={s.h2}><Shield size={24} color="#34B1AA" /> 10. Privacy by Design and Default</h2>
                    <p style={s.p}>Thravic is built with privacy-first architecture, including:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Minimal data collection</li>
                        <li style={s.listItem}>IP anonymization practices</li>
                        <li style={s.listItem}>No cross-site tracking</li>
                        <li style={s.listItem}>No selling or monetization of personal data</li>
                    </ul>
                    <p style={s.p}>Default settings are configured to ensure maximum privacy protection.</p>
                </section>

                {/* 11. Data Retention */}
                <section style={s.section}>
                    <h2 style={s.h2}>11. Data Retention</h2>
                    <p style={s.p}>Data retention depends on Customer configuration and plan level:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Short-term identifiable data is minimized</li>
                        <li style={s.listItem}>Long-term analytics data is anonymized or aggregated</li>
                    </ul>
                </section>

                {/* 12. Cookies */}
                <section style={s.section}>
                    <h2 style={s.h2}><Cookie size={24} color="#f59e0b" /> 12. Cookies and Tracking Technologies</h2>
                    <p style={s.p}>Thravic may use cookies or similar technologies to:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Track sessions</li>
                        <li style={s.listItem}>Measure user interactions</li>
                        <li style={s.listItem}>Improve analytics accuracy</li>
                    </ul>
                    <p style={s.p}>Customers are responsible for:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Implementing cookie consent banners</li>
                        <li style={s.listItem}>Obtaining user consent where required under GDPR and ePrivacy Directive</li>
                    </ul>
                </section>

                {/* 13. DPO */}
                <section style={s.section}>
                    <h2 style={s.h2}>13. Data Protection Officer (DPO)</h2>
                    <p style={s.p}>At this stage, Thravic may not require a formal Data Protection Officer under GDPR Article 37.</p>
                    <p style={s.p}>However, privacy-related inquiries can be directed to:</p>
                    <p style={{ ...s.p, fontWeight: 600 }}>Email: thravic247@gmail.com</p>
                </section>

                {/* 14. Supervisory Authority */}
                <section style={s.section}>
                    <h2 style={s.h2}>14. Supervisory Authority</h2>
                    <p style={s.p}>EU users have the right to lodge complaints with their local data protection authority if they believe their rights have been violated.</p>
                </section>

                {/* 15. Updates */}
                <section style={s.section}>
                    <h2 style={s.h2}><Bell size={24} color="#f59e0b" /> 15. Updates to This Statement</h2>
                    <p style={s.p}>We may update this GDPR Compliance Statement periodically. Changes will be reflected by the &ldquo;Last Updated&rdquo; date.</p>
                </section>

                {/* 16. Commitment */}
                <section style={s.section}>
                    <h2 style={s.h2}>16. Commitment to Compliance</h2>
                    <p style={s.p}>Thravic is committed to maintaining full GDPR compliance by:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Continuously improving data protection practices</li>
                        <li style={s.listItem}>Monitoring regulatory developments</li>
                        <li style={s.listItem}>Ensuring transparency and accountability</li>
                    </ul>
                </section>

                {/* Final Note */}
                <div style={s.card}>
                    <h2 style={{ ...s.h2, marginBottom: '12px' }}><Shield size={24} color="#34B1AA" /> Final Note</h2>
                    <p style={{ ...s.p, marginBottom: 0 }}>
                        Thravic is designed to give businesses powerful analytics capabilities without compromising user privacy, aligning with modern regulatory standards and ethical data practices.
                    </p>
                </div>

                <footer style={{ marginTop: '80px', paddingTop: '40px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                        Questions about GDPR compliance? Contact us at thravic247@gmail.com
                    </p>
                </footer>
            </div>
        </div>
    );
}
