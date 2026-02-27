'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Save, Megaphone, X } from 'lucide-react';

interface Setting {
    key: string;
    value: any;
    updated_at: string;
}

// Known settings and their UI config
const settingsConfig: Record<string, { label: string; description: string; type: 'boolean' | 'number' | 'string' }> = {
    'registration.enabled': { label: 'Registration', description: 'Allow new user sign-ups', type: 'boolean' },
    'registration.email_verification': { label: 'Email Verification', description: 'Require email verification for new accounts', type: 'boolean' },
    'tracking.enabled': { label: 'Event Tracking', description: 'Accept incoming tracking events', type: 'boolean' },
    'maintenance.enabled': { label: 'Maintenance Mode', description: 'Display maintenance page for non-admin users', type: 'boolean' },
    'billing.enabled': { label: 'Billing', description: 'Allow plan upgrades and payments', type: 'boolean' },
    'api.rate_limit': { label: 'API Rate Limit', description: 'Max API requests per minute per user', type: 'number' },
    'events.max_batch_size': { label: 'Max Batch Size', description: 'Max events accepted per batch request', type: 'number' },
};

export default function SettingsPage() {
    const [settings, setSettings] = useState<Setting[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Record<string, any>>({});

    // Announcement state
    const [announcementMsg, setAnnouncementMsg] = useState('');
    const [announcementSeverity, setAnnouncementSeverity] = useState<'info' | 'warning' | 'critical'>('info');
    const [announcementActive, setAnnouncementActive] = useState(false);
    const [announcementSaving, setAnnouncementSaving] = useState(false);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const data = await api.get('/api/admin/settings');
            const list: Setting[] = Array.isArray(data.settings) ? data.settings : [];
            // If DB is empty, seed UI with defaults from settingsConfig
            if (list.length === 0) {
                const defaults: Setting[] = Object.entries(settingsConfig).map(([key, cfg]) => ({
                    key,
                    value: cfg.type === 'boolean' ? true : cfg.type === 'number' ? 100 : '',
                    updated_at: new Date().toISOString(),
                }));
                setSettings(defaults);
                const values: Record<string, any> = {};
                defaults.forEach(s => { values[s.key] = s.value; });
                setEditValues(values);
            } else {
                setSettings(list);
                const values: Record<string, any> = {};
                list.forEach(s => { values[s.key] = s.value; });
                setEditValues(values);
                // Restore announcement state
                const msg = list.find(s => s.key === 'announcement.message')?.value ?? '';
                const sev = list.find(s => s.key === 'announcement.severity')?.value ?? 'info';
                const active = list.find(s => s.key === 'announcement.enabled')?.value ?? false;
                setAnnouncementMsg(typeof msg === 'string' ? msg : '');
                setAnnouncementSeverity(sev as any);
                setAnnouncementActive(active === true || active === 'true');
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadSettings(); }, []);

    const handleSave = async (key: string) => {
        setSaving(key);
        try {
            await api.put(`/api/admin/settings/${key}`, { value: editValues[key] });
        } catch (err: any) { alert(err.message); }
        finally { setSaving(null); }
    };

    const handleToggle = async (key: string) => {
        const newValue = !editValues[key];
        setEditValues(v => ({ ...v, [key]: newValue }));
        setSaving(key);
        try {
            await api.put(`/api/admin/settings/${key}`, { value: newValue });
        } catch (err: any) {
            setEditValues(v => ({ ...v, [key]: !newValue }));
            alert(err.message);
        } finally { setSaving(null); }
    };

    const publishAnnouncement = async () => {
        if (!announcementMsg.trim()) { alert('Enter a message first.'); return; }
        setAnnouncementSaving(true);
        try {
            await Promise.all([
                api.put('/api/admin/settings/announcement.enabled', { value: true }),
                api.put('/api/admin/settings/announcement.message', { value: announcementMsg.trim() }),
                api.put('/api/admin/settings/announcement.severity', { value: announcementSeverity }),
            ]);
            setAnnouncementActive(true);
        } catch (err: any) { alert(err.message); }
        finally { setAnnouncementSaving(false); }
    };

    const clearAnnouncement = async () => {
        setAnnouncementSaving(true);
        try {
            await api.put('/api/admin/settings/announcement.enabled', { value: false });
            setAnnouncementMsg('');
            setAnnouncementActive(false);
        } catch (err: any) { alert(err.message); }
        finally { setAnnouncementSaving(false); }
    };

    if (loading) return <div className="loading"><div className="spinner" /></div>;

    // Group into boolean toggles and value settings
    // (filter out announcement.* keys — managed by the Announcement card)
    const boolSettings = settings.filter(s => settingsConfig[s.key]?.type === 'boolean');
    const otherSettings = settings.filter(s => settingsConfig[s.key]?.type !== 'boolean');

    const severityColors: Record<string, string> = {
        info: '#6366f1', warning: '#f59e0b', critical: '#ef4444',
    };

    return (
        <div>
            {/* ── Announcement Banner Control ─────────────── */}
            <div className="card" style={{ marginBottom: 'var(--space-xl)', borderLeft: `4px solid ${severityColors[announcementSeverity]}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
                    <Megaphone size={18} style={{ color: severityColors[announcementSeverity] }} />
                    <span className="card-title" style={{ flex: 1 }}>Announcement Banner</span>
                    {announcementActive && (
                        <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '9999px', background: 'rgba(34,197,94,0.15)', color: '#4ade80', fontWeight: 600 }}>LIVE</span>
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    <textarea
                        className="input"
                        rows={2}
                        placeholder="Type your announcement message..."
                        value={announcementMsg}
                        onChange={e => setAnnouncementMsg(e.target.value)}
                        style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    />
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                        <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Severity:</label>
                        {(['info', 'warning', 'critical'] as const).map(s => (
                            <button
                                key={s}
                                onClick={() => setAnnouncementSeverity(s)}
                                style={{
                                    padding: '4px 12px',
                                    borderRadius: '9999px',
                                    border: `1px solid ${severityColors[s]}`,
                                    background: announcementSeverity === s ? severityColors[s] : 'transparent',
                                    color: announcementSeverity === s ? '#fff' : severityColors[s],
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    textTransform: 'capitalize',
                                }}
                            >{s}</button>
                        ))}
                        <div style={{ flex: 1 }} />
                        {announcementActive && (
                            <button className="btn btn-ghost btn-sm" onClick={clearAnnouncement} disabled={announcementSaving}>
                                <X size={14} /> Clear
                            </button>
                        )}
                        <button className="btn btn-primary btn-sm" onClick={publishAnnouncement} disabled={announcementSaving}>
                            <Megaphone size={14} /> {announcementActive ? 'Update' : 'Publish'}
                        </button>
                    </div>
                </div>
            </div>
            {/* Toggles */}
            <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
                <div className="card-title" style={{ marginBottom: 'var(--space-lg)' }}>Feature Toggles</div>
                {boolSettings.map(setting => {
                    const config = settingsConfig[setting.key];
                    return (
                        <div key={setting.key} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: 'var(--space-md) 0', borderBottom: '1px solid var(--color-border)'
                        }}>
                            <div>
                                <div style={{ fontWeight: 500, fontSize: '14px' }}>{config?.label || setting.key}</div>
                                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{config?.description}</div>
                            </div>
                            <label className="toggle">
                                <input
                                    type="checkbox"
                                    checked={editValues[setting.key] || false}
                                    onChange={() => handleToggle(setting.key)}
                                    disabled={saving === setting.key}
                                />
                                <span className="toggle-slider" />
                            </label>
                        </div>
                    );
                })}
            </div>

            {/* Other settings */}
            {otherSettings.length > 0 && (
                <div className="card">
                    <div className="card-title" style={{ marginBottom: 'var(--space-lg)' }}>Configuration Values</div>
                    {otherSettings.map(setting => {
                        const config = settingsConfig[setting.key];
                        return (
                            <div key={setting.key} style={{
                                display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                                padding: 'var(--space-md) 0', borderBottom: '1px solid var(--color-border)'
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 500, fontSize: '14px' }}>{config?.label || setting.key}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{config?.description || ''}</div>
                                </div>
                                <input
                                    className="input"
                                    style={{ width: '150px' }}
                                    type={config?.type === 'number' ? 'number' : 'text'}
                                    value={editValues[setting.key] ?? ''}
                                    onChange={e => setEditValues(v => ({
                                        ...v,
                                        [setting.key]: config?.type === 'number' ? parseInt(e.target.value) : e.target.value
                                    }))}
                                />
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleSave(setting.key)}
                                    disabled={saving === setting.key}
                                >
                                    <Save size={14} /> Save
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
