'use client';

import { useState, useEffect } from 'react';
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
    Crown
} from 'lucide-react';
import { auth, domains } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UserData {
    id: string;
    name: string;
    email: string;
    subscription: string;
    createdAt?: string;
}

const plans = [
    {
        id: 'free',
        name: 'Free',
        price: 0,
        features: ['1 domain', '1,000 events/mo', '7-day history', 'Basic analytics']
    },
    {
        id: 'pro',
        name: 'Pro',
        price: 29,
        features: ['5 domains', '50,000 events/mo', '30-day history', 'Heatmaps', 'Funnels', 'Session recordings']
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: 99,
        features: ['Unlimited domains', 'Unlimited events', '1-year history', 'AI insights', 'Priority support', 'Custom integrations']
    }
];

export default function SettingsPage() {
    const [user, setUser] = useState<UserData | null>(null);
    const [domainList, setDomainList] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'account' | 'subscription' | 'notifications' | 'export'>('account');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

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
        productUpdates: true
    });

    useEffect(() => {
        const loadData = async () => {
            const [userRes, domainsRes] = await Promise.all([
                auth.getMe(),
                domains.list()
            ]);

            if (userRes.data) {
                setUser(userRes.data);
                setName(userRes.data.name);
                setEmail(userRes.data.email);
            }

            if (domainsRes.data) {
                setDomainList(domainsRes.data.domains);
            }

            setLoading(false);
        };

        loadData();
    }, []);

    const handleSaveProfile = async () => {
        setSaving(true);
        // Simulated save - would call API in production
        await new Promise(resolve => setTimeout(resolve, 1000));
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleExport = async (format: 'csv' | 'json') => {
        // Simulated export - would generate and download file
        const data = {
            exportDate: new Date().toISOString(),
            domains: domainList,
            format
        };

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
        { id: 'export', label: 'Export Data', icon: Download }
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
                                    textAlign: 'left'
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
                    {activeTab === 'account' && (
                        <div className="card">
                            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Account Settings</h3>

                            <div style={{ marginBottom: 'var(--space-lg)' }}>
                                <label style={{
                                    display: 'block',
                                    marginBottom: 'var(--space-xs)',
                                    fontSize: '0.875rem',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>

                            <div style={{ marginBottom: 'var(--space-lg)' }}>
                                <label style={{
                                    display: 'block',
                                    marginBottom: 'var(--space-xs)',
                                    fontSize: '0.875rem',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    className="input"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: 'var(--space-xl) 0' }} />

                            <h4 style={{ marginBottom: 'var(--space-md)' }}>Change Password</h4>

                            <div style={{ marginBottom: 'var(--space-md)' }}>
                                <label style={{
                                    display: 'block',
                                    marginBottom: 'var(--space-xs)',
                                    fontSize: '0.875rem',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    Current Password
                                </label>
                                <input
                                    type="password"
                                    className="input"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                />
                            </div>

                            <div style={{ marginBottom: 'var(--space-lg)' }}>
                                <label style={{
                                    display: 'block',
                                    marginBottom: 'var(--space-xs)',
                                    fontSize: '0.875rem',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    New Password
                                </label>
                                <input
                                    type="password"
                                    className="input"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                />
                            </div>

                            <button
                                onClick={handleSaveProfile}
                                className="btn btn-primary"
                                disabled={saving}
                            >
                                {saved ? <Check size={18} /> : <Save size={18} />}
                                {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
                            </button>

                            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: 'var(--space-xl) 0' }} />

                            <h4 style={{ marginBottom: 'var(--space-md)', color: 'var(--color-error)' }}>Danger Zone</h4>
                            <button className="btn" style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: 'var(--color-error)',
                                border: '1px solid var(--color-error)'
                            }}>
                                <Trash2 size={18} />
                                Delete Account
                            </button>
                        </div>
                    )}

                    {activeTab === 'subscription' && (
                        <div>
                            {/* Current Plan */}
                            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                                <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-md)' }}>
                                    <h3>Current Plan</h3>
                                    <span className="badge" style={{ background: 'var(--color-accent-gradient)' }}>
                                        <Crown size={12} style={{ marginRight: '4px' }} />
                                        {user?.subscription || 'Free'}
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                    {user?.subscription === 'free'
                                        ? 'You are on the Free plan. Upgrade to unlock more features.'
                                        : `You have access to all ${user?.subscription} features.`
                                    }
                                </p>
                            </div>

                            {/* Plan Options */}
                            <div className="grid grid-cols-3 gap-md">
                                {plans.map(plan => (
                                    <div
                                        key={plan.id}
                                        className="card"
                                        style={{
                                            borderColor: plan.id === user?.subscription
                                                ? 'var(--color-accent-primary)'
                                                : undefined
                                        }}
                                    >
                                        <h4 style={{ marginBottom: 'var(--space-sm)' }}>{plan.name}</h4>
                                        <div style={{ marginBottom: 'var(--space-md)' }}>
                                            <span style={{ fontSize: '2rem', fontWeight: 700 }}>
                                                ${plan.price}
                                            </span>
                                            <span style={{ color: 'var(--color-text-muted)' }}>/mo</span>
                                        </div>

                                        <ul style={{
                                            listStyle: 'none',
                                            padding: 0,
                                            marginBottom: 'var(--space-lg)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 'var(--space-sm)'
                                        }}>
                                            {plan.features.map((feature, i) => (
                                                <li key={i} className="flex items-center gap-sm" style={{ fontSize: '0.875rem' }}>
                                                    <Check size={14} style={{ color: 'var(--color-success)' }} />
                                                    {feature}
                                                </li>
                                            ))}
                                        </ul>

                                        <button
                                            className={`btn ${plan.id === user?.subscription ? 'btn-secondary' : 'btn-primary'}`}
                                            style={{ width: '100%' }}
                                            disabled={plan.id === user?.subscription}
                                        >
                                            {plan.id === user?.subscription ? 'Current Plan' : 'Upgrade'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'notifications' && (
                        <div className="card">
                            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Notification Preferences</h3>

                            {Object.entries(notifications).map(([key, value]) => (
                                <div
                                    key={key}
                                    className="flex items-center justify-between"
                                    style={{
                                        padding: 'var(--space-md) 0',
                                        borderBottom: '1px solid var(--color-border)'
                                    }}
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
                                            transition: 'background var(--transition-fast)'
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
                                            transition: 'left var(--transition-fast)'
                                        }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

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
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                        Spreadsheet compatible
                                    </span>
                                </button>

                                <button
                                    onClick={() => handleExport('json')}
                                    className="btn btn-secondary"
                                    style={{ padding: 'var(--space-lg)', flexDirection: 'column', height: 'auto' }}
                                >
                                    <Download size={24} style={{ marginBottom: 'var(--space-sm)' }} />
                                    <span style={{ fontWeight: 600 }}>Export as JSON</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                        Developer friendly
                                    </span>
                                </button>
                            </div>

                            <div style={{
                                padding: 'var(--space-md)',
                                background: 'var(--color-bg-secondary)',
                                borderRadius: 'var(--radius-md)',
                                borderLeft: '3px solid var(--color-accent-primary)'
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
        </div>
    );
}
