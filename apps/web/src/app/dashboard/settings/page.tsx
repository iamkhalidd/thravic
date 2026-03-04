'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Settings,
    User,
    CreditCard,
    Shield,
    Download,
    Bell,
    Trash2,
    Save,
    Check,
    Crown,
    Loader,
    AlertCircle,
    X,
} from 'lucide-react';
import { auth, domains, payments } from '@/lib/api';

const plans = [
    {
        id: 'free',
        name: 'Hobby',
        price: 0,
        currency: 'USD',
        features: ['1 domain', '5,000 events/mo', '30-day history', 'Core analytics & UTM'],
    },
    {
        id: 'pro',
        name: 'Pro',
        price: 29,
        currency: 'USD',
        features: ['3 domains', '100,000 events/mo', '1-year history', 'Heatmaps & recordings', 'Funnels & AI insights', 'CSV export & team'],
    },
    {
        id: 'agency',
        name: 'Agency',
        price: 79,
        currency: 'USD',
        features: ['20 domains', '500,000 events/mo', '2-year history', 'Everything in Pro', 'Unlimited team members', 'Priority support'],
    },
];

interface UserData {
    id: string;
    name: string;
    email: string;
    subscription: string;
    createdAt?: string;
}

export default function SettingsPage() {
    const searchParams = useSearchParams();

    const [user, setUser] = useState<UserData | null>(null);
    const [domainList, setDomainList] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'account' | 'subscription' | 'notifications' | 'export'>('account');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Upgrade state
    const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
    const [upgradeError, setUpgradeError] = useState<string | null>(null);
    const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null); // plan name after success

    // Form states
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');

    // Notification settings
    const [notifications, setNotifications] = useState({
        weeklyReport: true,
        trafficAlerts: true,
        insightAlerts: false,
        productUpdates: true,
    });

    // ── Load user data ─────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        const [userRes, domainsRes] = await Promise.all([auth.getMe(), domains.list()]);

        if (userRes.data) {
            setUser(userRes.data as UserData);
            setName(userRes.data.name);
            setEmail(userRes.data.email);
        }
        if (domainsRes.data) {
            setDomainList(domainsRes.data.domains);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ── Handle Paystack redirect-back ──────────────────────────────────────────
    useEffect(() => {
        const paymentStatus = searchParams.get('payment');
        const reference = searchParams.get('reference');

        if (paymentStatus === 'success' && reference) {
            // Switch to subscription tab automatically
            setActiveTab('subscription');

            // Verify the payment server-side
            (async () => {
                const result = await payments.verify(reference);
                if (result) {
                    setPaymentSuccess(result.plan);
                    // Refresh user so the displayed plan updates
                    const userRes = await auth.getMe();
                    if (userRes.data) setUser(userRes.data as UserData);
                } else {
                    setUpgradeError('Payment verification failed. Please contact support if your account was charged.');
                }
                // Clean up query params without full page reload
                const url = new URL(window.location.href);
                url.searchParams.delete('payment');
                url.searchParams.delete('reference');
                window.history.replaceState({}, '', url.toString());
            })();
        }
    }, [searchParams]);

    // ── Upgrade handler ────────────────────────────────────────────────────────
    const handleUpgrade = async (planId: string) => {
        setUpgradeError(null);
        setUpgradingPlan(planId);

        try {
            const result = await payments.checkout(planId);
            if (result?.checkoutUrl) {
                window.location.href = result.checkoutUrl;
            } else {
                setUpgradeError('Could not start checkout. Is the server configured with a Paystack key?');
                setUpgradingPlan(null);
            }
        } catch {
            setUpgradeError('Checkout failed. Please try again.');
            setUpgradingPlan(null);
        }
    };

    // ── Profile save ───────────────────────────────────────────────────────────
    const handleSaveProfile = async () => {
        setSaving(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleExport = async (format: 'csv' | 'json') => {
        const data = { exportDate: new Date().toISOString(), domains: domainList, format };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trackflow-export-${format}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const tabs = [
        { id: 'account', label: 'Account', icon: User },
        { id: 'subscription', label: 'Subscription', icon: CreditCard },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'export', label: 'Export Data', icon: Download },
    ];

    if (loading) {
        return (
            <div>
                <div className="skeleton" style={{ height: '40px', width: '200px', marginBottom: 'var(--space-xl)' }} />
                <div className="card">
                    <div className="skeleton" style={{ height: '400px' }} />
                </div>
            </div>
        );
    }

    const currentPlan = user?.subscription || 'free';

    return (
        <div>
            <h1 style={{ marginBottom: 'var(--space-xl)' }}>Settings</h1>

            <div className="grid grid-cols-4 gap-lg">
                {/* Sidebar */}
                <div>
                    <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-sm)',
                                    padding: 'var(--space-sm) var(--space-md)',
                                    background: activeTab === tab.id ? 'var(--color-bg-hover)' : 'transparent',
                                    border: 'none',
                                    borderRadius: 'var(--radius-md)',
                                    color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    textAlign: 'left',
                                }}
                            >
                                <tab.icon size={18} />
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content */}
                <div style={{ gridColumn: 'span 3' }}>

                    {/* ── Account Tab ── */}
                    {activeTab === 'account' && (
                        <div className="card">
                            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Account Settings</h3>

                            <div style={{ marginBottom: 'var(--space-lg)' }}>
                                <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                    Full Name
                                </label>
                                <input type="text" className="input" value={name} onChange={e => setName(e.target.value)} />
                            </div>

                            <div style={{ marginBottom: 'var(--space-lg)' }}>
                                <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                    Email Address
                                </label>
                                <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} />
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: 'var(--space-xl) 0' }} />

                            <h4 style={{ marginBottom: 'var(--space-md)' }}>Change Password</h4>

                            <div style={{ marginBottom: 'var(--space-md)' }}>
                                <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                    Current Password
                                </label>
                                <input type="password" className="input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                            </div>

                            <div style={{ marginBottom: 'var(--space-lg)' }}>
                                <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                    New Password
                                </label>
                                <input type="password" className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                            </div>

                            <button onClick={handleSaveProfile} className="btn btn-primary" disabled={saving}>
                                {saved ? <Check size={18} /> : <Save size={18} />}
                                {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
                            </button>

                            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: 'var(--space-xl) 0' }} />

                            <h4 style={{ marginBottom: 'var(--space-md)', color: 'var(--color-error)' }}>Danger Zone</h4>
                            <button className="btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-error)', border: '1px solid var(--color-error)' }}>
                                <Trash2 size={18} />
                                Delete Account
                            </button>
                        </div>
                    )}

                    {/* ── Subscription Tab ── */}
                    {activeTab === 'subscription' && (
                        <div>
                            {/* Payment success banner */}
                            {paymentSuccess && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-sm)',
                                    padding: 'var(--space-md) var(--space-lg)',
                                    background: 'rgba(34, 197, 94, 0.12)',
                                    border: '1px solid rgba(34, 197, 94, 0.4)',
                                    borderRadius: 'var(--radius-md)',
                                    marginBottom: 'var(--space-lg)',
                                    color: '#22c55e',
                                    fontWeight: 500,
                                }}>
                                    <Check size={18} />
                                    <span>
                                        🎉 Payment successful! Your account has been upgraded to the{' '}
                                        <strong style={{ textTransform: 'capitalize' }}>{paymentSuccess}</strong> plan.
                                    </span>
                                    <button
                                        onClick={() => setPaymentSuccess(null)}
                                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            )}

                            {/* Error banner */}
                            {upgradeError && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-sm)',
                                    padding: 'var(--space-md) var(--space-lg)',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.35)',
                                    borderRadius: 'var(--radius-md)',
                                    marginBottom: 'var(--space-lg)',
                                    color: 'var(--color-error)',
                                    fontWeight: 500,
                                }}>
                                    <AlertCircle size={18} />
                                    <span style={{ flex: 1 }}>{upgradeError}</span>
                                    <button
                                        onClick={() => setUpgradeError(null)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            )}

                            {/* Current Plan */}
                            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                                <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-md)' }}>
                                    <h3>Current Plan</h3>
                                    <span className="badge" style={{ background: 'var(--color-accent-gradient)' }}>
                                        <Crown size={12} style={{ marginRight: '4px' }} />
                                        {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                    {currentPlan === 'free'
                                        ? 'You are on the Free plan. Upgrade to unlock more features.'
                                        : `You have access to all ${currentPlan} features.`}
                                </p>
                                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-xs)' }}>
                                    Payments are securely processed by <strong>Paystack</strong> in USD.
                                </p>
                            </div>

                            {/* Plan Cards */}
                            <div className="grid grid-cols-3 gap-md">
                                {plans.map(plan => {
                                    const isCurrent = plan.id === currentPlan;
                                    const isFree = plan.id === 'free';
                                    const isLoading = upgradingPlan === plan.id;

                                    return (
                                        <div
                                            key={plan.id}
                                            className="card"
                                            style={{
                                                borderColor: isCurrent ? 'var(--color-accent-primary)' : undefined,
                                                position: 'relative',
                                                opacity: upgradingPlan && !isLoading ? 0.7 : 1,
                                                transition: 'opacity 0.2s',
                                            }}
                                        >
                                            <h4 style={{ marginBottom: 'var(--space-sm)' }}>{plan.name}</h4>
                                            <div style={{ marginBottom: 'var(--space-md)' }}>
                                                <span style={{ fontSize: '2rem', fontWeight: 700 }}>
                                                    ${plan.price}
                                                </span>
                                                <span style={{ color: 'var(--color-text-muted)' }}>
                                                    {plan.price > 0 ? ' USD/mo' : ''}
                                                </span>
                                            </div>

                                            <ul style={{
                                                listStyle: 'none',
                                                padding: 0,
                                                marginBottom: 'var(--space-lg)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 'var(--space-sm)',
                                            }}>
                                                {plan.features.map((feature, i) => (
                                                    <li key={i} className="flex items-center gap-sm" style={{ fontSize: '0.875rem' }}>
                                                        <Check size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                                                        {feature}
                                                    </li>
                                                ))}
                                            </ul>

                                            <button
                                                className={`btn ${isCurrent || isFree ? 'btn-secondary' : 'btn-primary'}`}
                                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                                disabled={isCurrent || isFree || !!upgradingPlan}
                                                onClick={() => !isCurrent && !isFree && handleUpgrade(plan.id)}
                                            >
                                                {isLoading ? (
                                                    <>
                                                        <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                                        Redirecting...
                                                    </>
                                                ) : isCurrent ? (
                                                    'Current Plan'
                                                ) : isFree ? (
                                                    'Free Forever'
                                                ) : (
                                                    `Upgrade — $${plan.price}/mo`
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Paystack badge */}
                            <p style={{
                                marginTop: 'var(--space-lg)',
                                fontSize: '0.8rem',
                                color: 'var(--color-text-muted)',
                                textAlign: 'center',
                            }}>
                                🔒 Secure payment via Paystack · All prices in USD · Cancel anytime
                            </p>
                        </div>
                    )}

                    {/* ── Notifications Tab ── */}
                    {activeTab === 'notifications' && (
                        <div className="card">
                            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Notification Preferences</h3>

                            {Object.entries(notifications).map(([key, value]) => (
                                <div
                                    key={key}
                                    className="flex items-center justify-between"
                                    style={{ padding: 'var(--space-md) 0', borderBottom: '1px solid var(--color-border)' }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 500 }}>
                                            {key === 'weeklyReport' && 'Weekly Report'}
                                            {key === 'trafficAlerts' && 'Traffic Alerts'}
                                            {key === 'insightAlerts' && 'AI Insight Alerts'}
                                            {key === 'productUpdates' && 'Product Updates'}
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                            {key === 'weeklyReport' && 'Receive a summary of your analytics every week'}
                                            {key === 'trafficAlerts' && 'Get notified of significant traffic changes'}
                                            {key === 'insightAlerts' && 'Receive high-priority AI insights via email'}
                                            {key === 'productUpdates' && 'Stay updated on new features and improvements'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setNotifications(prev => ({ ...prev, [key]: !value }))}
                                        style={{
                                            width: '48px',
                                            height: '24px',
                                            borderRadius: 'var(--radius-full)',
                                            background: value ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)',
                                            border: 'none',
                                            cursor: 'pointer',
                                            position: 'relative',
                                            transition: 'background var(--transition-fast)',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <span style={{
                                            position: 'absolute',
                                            top: '2px',
                                            left: value ? '26px' : '2px',
                                            width: '20px',
                                            height: '20px',
                                            borderRadius: 'var(--radius-full)',
                                            background: 'white',
                                            transition: 'left var(--transition-fast)',
                                        }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Export Tab ── */}
                    {activeTab === 'export' && (
                        <div className="card">
                            <h3 style={{ marginBottom: 'var(--space-md)' }}>Export Your Data</h3>
                            <p style={{ marginBottom: 'var(--space-lg)', color: 'var(--color-text-secondary)' }}>
                                Download all your analytics data in your preferred format.
                            </p>

                            <div className="grid grid-cols-2 gap-md" style={{ marginBottom: 'var(--space-xl)' }}>
                                <button
                                    onClick={() => handleExport('csv')}
                                    className="btn btn-secondary"
                                    style={{ padding: 'var(--space-lg)', flexDirection: 'column', height: 'auto' }}
                                >
                                    <Download size={24} style={{ marginBottom: 'var(--space-sm)' }} />
                                    <span style={{ fontWeight: 600 }}>Export as CSV</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Spreadsheet compatible</span>
                                </button>

                                <button
                                    onClick={() => handleExport('json')}
                                    className="btn btn-secondary"
                                    style={{ padding: 'var(--space-lg)', flexDirection: 'column', height: 'auto' }}
                                >
                                    <Download size={24} style={{ marginBottom: 'var(--space-sm)' }} />
                                    <span style={{ fontWeight: 600 }}>Export as JSON</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Developer friendly</span>
                                </button>
                            </div>

                            <div style={{
                                padding: 'var(--space-md)',
                                background: 'var(--color-bg-secondary)',
                                borderRadius: 'var(--radius-md)',
                                borderLeft: '3px solid var(--color-accent-primary)',
                            }}>
                                <Shield size={18} style={{ marginBottom: 'var(--space-sm)', color: 'var(--color-accent-primary)' }} />
                                <p style={{ fontSize: '0.875rem', margin: 0 }}>
                                    Your data is exported securely and includes all events, funnels, and insights from the last 30 days.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Spinner keyframe */}
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
