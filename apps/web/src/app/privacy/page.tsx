'use client';

import React from 'react';
import Link from 'next/link';
import { BarChart3, ArrowLeft, Shield, Lock, Eye, FileText, Globe, Users, Bell, Trash2 } from 'lucide-react';

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
    divider: { border: 'none', borderTop: '1px solid var(--color-border)', margin: '48px 0' },
    dpaTitle: { fontSize: '1.75rem', fontWeight: 700, textAlign: 'center' as const, margin: '48px 0 8px', letterSpacing: '-0.03em' },
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
                    <h1 style={s.h1}>Privacy Policy & Data Processing Agreement</h1>
                    <p style={s.subtitle}>Last Updated: March 17, 2026</p>
                </header>

                {/* 1. Introduction */}
                <section style={s.section}>
                    <h2 style={s.h2}><Shield size={24} color="#34B1AA" /> 1. Introduction</h2>
                    <p style={s.p}>
                        This Privacy Policy and Data Processing Agreement (&ldquo;Agreement&rdquo;) describes how Thravic (&ldquo;Thravic,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) collects, processes, and protects data in connection with its analytics and traffic intelligence services (the &ldquo;Services&rdquo;).
                    </p>
                    <p style={s.p}>
                        By using Thravic, Customers (&ldquo;you,&rdquo; &ldquo;Controller&rdquo;) agree to the terms of this Agreement.
                    </p>
                </section>

                {/* 2. Scope and Roles */}
                <section style={s.section}>
                    <h2 style={s.h2}><Users size={24} color="var(--color-accent-primary)" /> 2. Scope and Roles</h2>
                    <h3 style={s.h3}>2.1 Roles of the Parties</h3>
                    <p style={s.p}>For the purposes of applicable data protection laws:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}><strong>Customer</strong> acts as the Data Controller</li>
                        <li style={s.listItem}><strong>Thravic</strong> acts as the Data Processor</li>
                    </ul>
                    <p style={s.p}>
                        Thravic processes personal data strictly on behalf of and under the instructions of the Customer.
                    </p>
                </section>

                {/* 3. Categories of Data Processed */}
                <section style={s.section}>
                    <h2 style={s.h2}><Eye size={24} color="var(--color-accent-primary)" /> 3. Categories of Data Processed</h2>
                    <p style={s.p}>Thravic processes limited categories of data necessary to provide analytics services:</p>
                    <div style={s.card}>
                        <h3 style={s.h3}>3.1 Traffic Source Data</h3>
                        <ul style={s.list}>
                            <li style={s.listItem}>Referral URLs</li>
                            <li style={s.listItem}>Campaign identifiers (UTM parameters)</li>
                            <li style={s.listItem}>Source attribution</li>
                        </ul>
                        <h3 style={s.h3}>3.2 Usage Data</h3>
                        <ul style={s.list}>
                            <li style={s.listItem}>Page views and session activity</li>
                            <li style={s.listItem}>Click interactions</li>
                            <li style={s.listItem}>Navigation paths and behavioral flows</li>
                        </ul>
                        <h3 style={s.h3}>3.3 Device & Technical Data</h3>
                        <ul style={s.list}>
                            <li style={s.listItem}>Browser and version</li>
                            <li style={s.listItem}>Operating system</li>
                            <li style={s.listItem}>Device type and screen resolution</li>
                        </ul>
                        <h3 style={s.h3}>3.4 Geographic Data</h3>
                        <ul style={s.list}>
                            <li style={s.listItem}>Approximate location (country/city level) derived from IP</li>
                        </ul>
                        <p style={{ ...s.p, marginBottom: 0 }}>
                            <strong>IP Address Handling:</strong> IP addresses may be temporarily processed for security and geolocation purposes but are not stored in a persistent, human-readable format.
                        </p>
                    </div>
                </section>

                {/* 4. Purpose of Processing */}
                <section style={s.section}>
                    <h2 style={s.h2}><FileText size={24} color="#f59e0b" /> 4. Purpose of Processing</h2>
                    <p style={s.p}>Thravic processes data solely to:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Provide analytics and reporting services</li>
                        <li style={s.listItem}>Enable behavioral insights (e.g., session replays, heatmaps, funnels)</li>
                        <li style={s.listItem}>Improve Customer website performance</li>
                        <li style={s.listItem}>Ensure system security and integrity</li>
                    </ul>
                    <p style={s.p}><strong>Thravic does not:</strong></p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Sell or monetize personal data</li>
                        <li style={s.listItem}>Use data for advertising or profiling</li>
                        <li style={s.listItem}>Track users across unrelated websites</li>
                    </ul>
                </section>

                {/* 5. Legal Basis */}
                <section style={s.section}>
                    <h2 style={s.h2}>5. Legal Basis (Where Applicable)</h2>
                    <p style={s.p}>Processing is carried out based on:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Customer&rsquo;s legitimate interests in analytics and optimization</li>
                        <li style={s.listItem}>Consent, where required and obtained by the Customer</li>
                        <li style={s.listItem}>Compliance with legal obligations</li>
                    </ul>
                </section>

                <hr style={s.divider} />
                <h2 style={s.dpaTitle as any}>DATA PROCESSING AGREEMENT (DPA)</h2>
                <hr style={s.divider} />

                {/* 6–8 */}
                <section style={s.section}>
                    <h2 style={s.h2}>6. Subject Matter and Duration</h2>
                    <p style={s.p}>This DPA governs the processing of personal data by Thravic for the duration of the Customer&rsquo;s use of the Services.</p>
                </section>

                <section style={s.section}>
                    <h2 style={s.h2}>7. Nature and Purpose of Processing</h2>
                    <p style={s.p}>Processing includes:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Collection, Recording, Organization</li>
                        <li style={s.listItem}>Storage, Analysis, Retrieval</li>
                        <li style={s.listItem}>Deletion or anonymization</li>
                    </ul>
                    <p style={s.p}>All strictly for providing analytics services.</p>
                </section>

                <section style={s.section}>
                    <h2 style={s.h2}>8. Types of Personal Data</h2>
                    <ul style={s.list}>
                        <li style={s.listItem}>Online identifiers (e.g., IP address, cookie identifiers)</li>
                        <li style={s.listItem}>Device information</li>
                        <li style={s.listItem}>Behavioral interaction data</li>
                    </ul>
                    <p style={s.p}>No special categories of personal data are intentionally collected.</p>
                </section>

                {/* 9 */}
                <section style={s.section}>
                    <h2 style={s.h2}>9. Categories of Data Subjects</h2>
                    <p style={s.p}>Data subjects may include:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Website visitors</li>
                        <li style={s.listItem}>Application users</li>
                        <li style={s.listItem}>End-users interacting with Customer platforms</li>
                    </ul>
                </section>

                {/* 10. Processor Obligations */}
                <section style={s.section}>
                    <h2 style={s.h2}><Lock size={24} color="#f59e0b" /> 10. Processor Obligations (Thravic)</h2>
                    <p style={s.p}>Thravic agrees to:</p>

                    <div style={s.card}>
                        <h3 style={s.h3}>10.1 Process Data Only on Instructions</h3>
                        <p style={{ ...s.p, marginBottom: '24px' }}>Process personal data only on documented instructions from the Customer unless required by law.</p>

                        <h3 style={s.h3}>10.2 Confidentiality</h3>
                        <p style={{ ...s.p, marginBottom: '24px' }}>Ensure that all personnel authorized to process data are bound by confidentiality obligations.</p>

                        <h3 style={s.h3}>10.3 Security Measures</h3>
                        <p style={s.p}>Implement appropriate technical and organizational measures, including:</p>
                        <ul style={s.list}>
                            <li style={s.listItem}>Encryption in transit and at rest</li>
                            <li style={s.listItem}>Access control and authentication</li>
                            <li style={s.listItem}>Monitoring and incident detection</li>
                        </ul>

                        <h3 style={s.h3}>10.4 Sub-Processors</h3>
                        <p style={s.p}>Thravic may engage sub-processors (e.g., cloud hosting providers), provided that:</p>
                        <ul style={s.list}>
                            <li style={s.listItem}>They are bound by equivalent data protection obligations</li>
                            <li style={s.listItem}>Thravic remains fully liable for their actions</li>
                        </ul>

                        <h3 style={s.h3}>10.5 Assistance to Controller</h3>
                        <p style={s.p}>Thravic shall assist the Customer, where reasonably possible, in:</p>
                        <ul style={s.list}>
                            <li style={s.listItem}>Responding to data subject requests</li>
                            <li style={s.listItem}>Ensuring compliance with GDPR, CCPA, and similar laws</li>
                            <li style={s.listItem}>Conducting data protection impact assessments (where required)</li>
                        </ul>

                        <h3 style={s.h3}>10.6 Data Breach Notification</h3>
                        <p style={{ ...s.p, marginBottom: '24px' }}>Thravic will notify the Customer without undue delay upon becoming aware of a personal data breach.</p>

                        <h3 style={s.h3}>10.7 Deletion or Return of Data</h3>
                        <p style={s.p}>Upon termination of Services, Thravic will:</p>
                        <ul style={s.list}>
                            <li style={s.listItem}>Delete or anonymize personal data</li>
                            <li style={s.listItem}>Retain data only where legally required</li>
                        </ul>

                        <h3 style={s.h3}>10.8 Audit Rights</h3>
                        <p style={{ ...s.p, marginBottom: 0 }}>Customers may request reasonable information to verify Thravic&rsquo;s compliance with this Agreement.</p>
                    </div>
                </section>

                {/* 11–13 */}
                <section style={s.section}>
                    <h2 style={s.h2}><Trash2 size={24} color="#ef4444" /> 11. Data Retention</h2>
                    <p style={s.p}>Data is retained only as necessary:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Short-term processing (e.g., IP handling) is minimized</li>
                        <li style={s.listItem}>Long-term analytics data may be anonymized</li>
                        <li style={s.listItem}>Retention periods depend on Customer plan configuration</li>
                    </ul>
                </section>

                <section style={s.section}>
                    <h2 style={s.h2}><Lock size={24} color="#34B1AA" /> 12. Data Security</h2>
                    <p style={s.p}>Thravic maintains industry-standard safeguards:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}><strong>Encryption:</strong> HTTPS/TLS and encrypted storage</li>
                        <li style={s.listItem}><strong>Access Control:</strong> Restricted, role-based access</li>
                        <li style={s.listItem}><strong>Minimization:</strong> Limited collection of identifiable data</li>
                    </ul>
                </section>

                <section style={s.section}>
                    <h2 style={s.h2}><Globe size={24} color="var(--color-accent-primary)" /> 13. International Data Transfers</h2>
                    <p style={s.p}>Where data is transferred internationally, Thravic ensures appropriate safeguards such as:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Standard Contractual Clauses (SCCs)</li>
                        <li style={s.listItem}>Equivalent legal protections</li>
                    </ul>
                </section>

                {/* 14–15 */}
                <section style={s.section}>
                    <h2 style={s.h2}><FileText size={24} color="#ef4444" /> 14. Data Subject Rights</h2>
                    <p style={s.p}>End-users have the right to:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Access their personal data</li>
                        <li style={s.listItem}>Request correction or deletion</li>
                        <li style={s.listItem}>Restrict or object to processing</li>
                        <li style={s.listItem}>Request data portability</li>
                    </ul>
                    <p style={s.p}>Requests should be directed to the Customer (data controller).</p>
                </section>

                <section style={s.section}>
                    <h2 style={s.h2}>15. Opt-Out Mechanisms</h2>
                    <p style={s.p}>Users may opt out of tracking via:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>Browser &ldquo;Do Not Track&rdquo; settings</li>
                        <li style={s.listItem}>Customer-provided consent tools</li>
                        <li style={s.listItem}>Script blocking mechanisms</li>
                    </ul>
                </section>

                {/* 16–18 */}
                <section style={s.section}>
                    <h2 style={s.h2}>16. Third-Party Disclosure</h2>
                    <p style={s.p}>Data is not sold or shared for advertising. Disclosure occurs only:</p>
                    <ul style={s.list}>
                        <li style={s.listItem}>When legally required</li>
                        <li style={s.listItem}>To protect system integrity</li>
                        <li style={s.listItem}>To essential service providers under strict agreements</li>
                    </ul>
                </section>

                <section style={s.section}>
                    <h2 style={s.h2}>17. Children&rsquo;s Data</h2>
                    <p style={s.p}>Thravic does not knowingly collect data from children under applicable legal age thresholds.</p>
                </section>

                <section style={s.section}>
                    <h2 style={s.h2}><Bell size={24} color="#f59e0b" /> 18. Changes to This Agreement</h2>
                    <p style={s.p}>We may update this Agreement periodically. Updates will be reflected by the &ldquo;Last Updated&rdquo; date.</p>
                </section>

                {/* 19–20 */}
                <section style={s.section}>
                    <h2 style={s.h2}>19. Contact Information</h2>
                    <p style={s.p}>For privacy-related inquiries:</p>
                    <p style={{ ...s.p, fontWeight: 600 }}>Email: thravic247@gmail.com</p>
                </section>

                <div style={s.card}>
                    <h2 style={{ ...s.h2, marginBottom: '12px' }}><Shield size={24} color="#34B1AA" /> 20. Final Statement</h2>
                    <p style={{ ...s.p, marginBottom: 0 }}>
                        Thravic is built on a privacy-first, compliance-driven foundation, ensuring that Customers can access powerful analytics while maintaining the trust, security, and rights of their users.
                    </p>
                </div>

                <footer style={{ marginTop: '80px', paddingTop: '40px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                        Questions about our privacy practices? Contact us at thravic247@gmail.com
                    </p>
                </footer>
            </div>
        </div>
    );
}
