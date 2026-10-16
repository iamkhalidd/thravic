'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Megaphone, X } from 'lucide-react';

interface Setting {
    key: string;
    value: any;
    updated_at: string;
}

// The switches the API reads (middleware/settings_gate.py). A missing key reads as
// off, so the page shows what the server does rather than assuming a default.
const toggles: { key: string; label: string; description: string }[] = [
    { key: 'registration.enabled', label: 'Sign-ups', description: 'Let new people create an account.' },
    { key: 'tracking.enabled', label: 'Event collection', description: 'Accept incoming events from tracked sites and apps.' },
    { key: 'maintenance.enabled', label: 'Maintenance mode', description: 'Answer every non-admin request with a maintenance notice.' },
];

const SEVERITIES = ['info', 'warning', 'critical'] as const;
type Severity = typeof SEVERITIES[number];

const rowStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    padding: '14px 20px', borderTop: '1px solid var(--color-border)',
} as const;

const isOn = (value: unknown) => value === true || value === 'true';

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState<string | null>(null);
    const [flags, setFlags] = useState<Record<string, boolean>>({});

    const [announcementMsg, setAnnouncementMsg] = useState('');
    const [announcementSeverity, setAnnouncementSeverity] = useState<Severity>('info');
    const [announcementActive, setAnnouncementActive] = useState(false);
    const [announcementSaving, setAnnouncementSaving] = useState(false);

    const [blockedIps, setBlockedIps] = useState('');
    const [blockedRefs, setBlockedRefs] = useState('');
    const [securitySaved, setSecuritySaved] = useState(false);

    const loadSettings = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const data = await api.get('/api/admin/settings');
            const list: Setting[] = Array.isArray(data.settings) ? data.settings : [];
            const value = (key: string) => list.find(s => s.key === key)?.value;

            setFlags(Object.fromEntries(toggles.map(t => [t.key, isOn(value(t.key))])));

            const msg = value('announcement.message');
            const sev = value('announcement.severity');
            setAnnouncementMsg(typeof msg === 'string' ? msg : '');
            setAnnouncementSeverity(SEVERITIES.includes(sev) ? sev : 'info');
            setAnnouncementActive(isOn(value('announcement.enabled')));

            const ips = value('security.blocked_ips');
            if (ips && Array.isArray(ips.ips)) setBlockedIps(ips.ips.join(', '));
            const refs = value('security.blocked_referrers');
            if (refs && Array.isArray(refs.referrers)) setBlockedRefs(refs.referrers.join(', '));
        } catch (err) {
            console.error(err);
            setFailed(true);
        } finally { setLoading(false); }
    };

    useEffect(() => { loadSettings(); }, []);

    const handleToggle = async (key: string) => {
        const next = !flags[key];
        setFlags(f => ({ ...f, [key]: next }));
        setSaving(key);
        try {
            await api.put(`/api/admin/settings/${key}`, { value: next });
        } catch (err: any) {
            setFlags(f => ({ ...f, [key]: !next }));
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
            await Promise.all([
                api.put('/api/admin/settings/announcement.enabled', { value: false }),
                api.put('/api/admin/settings/announcement.message', { value: '' }),
            ]);
            setAnnouncementActive(false);
            setAnnouncementMsg('');
        } catch (err: any) { alert(err.message); }
        finally { setAnnouncementSaving(false); }
    };

    const saveSecurity = async () => {
        setSaving('security');
        setSecuritySaved(false);
        try {
            const split = (text: string) => text.split(',').map(s => s.trim()).filter(Boolean);
            await api.put('/api/admin/settings/security.blocked_ips', { value: { ips: split(blockedIps) } });
            await api.put('/api/admin/settings/security.blocked_referrers', { value: { referrers: split(blockedRefs) } });
            setSecuritySaved(true);
        } catch (e: any) { alert(e.message); }
        finally { setSaving(null); }
    };

    if (loading) return <div className="loading"><div className="spinner" /></div>;
    // Never show switches we could not read: "off" would be a guess.
    if (failed) {
        return (
            <div className="card empty-note">
                Settings could not be loaded.{' '}
                <button className="btn btn-secondary btn-sm" onClick={loadSettings}>Try again</button>
            </div>
        );
    }

    return (
        <div className="page-stack" style={{ maxWidth: 820 }}>
            <section className="card card-flush">
                <div className="card-header" style={{ paddingBottom: 14, marginBottom: 0 }}>
                    <div>
                        <div className="card-title">Access</div>
                        <div className="card-subtitle">Changes reach the server within a minute.</div>
                    </div>
                </div>
                {toggles.map(t => (
                    <div key={t.key} style={rowStyle}>
                        <div>
                            <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{t.label}</div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{t.description}</div>
                        </div>
                        <label className="toggle">
                            <input
                                type="checkbox"
                                aria-label={t.label}
                                checked={flags[t.key] ?? false}
                                onChange={() => handleToggle(t.key)}
                                disabled={saving === t.key}
                            />
                            <span className="toggle-slider" />
                        </label>
                    </div>
                ))}
            </section>

            <section className="card">
                <div className="card-header">
                    <div>
                        <div className="card-title">Announcement</div>
                        <div className="card-subtitle">A banner shown to every signed-in user on their dashboard.</div>
                    </div>
                    {announcementActive && <span className="badge badge-success">Live</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <textarea
                        className="input"
                        rows={2}
                        placeholder="Type your announcement..."
                        value={announcementMsg}
                        onChange={e => setAnnouncementMsg(e.target.value)}
                        style={{ resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div className="segmented" role="group" aria-label="Severity">
                            {SEVERITIES.map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    aria-pressed={announcementSeverity === s}
                                    onClick={() => setAnnouncementSeverity(s)}
                                    style={{ textTransform: 'capitalize' }}
                                >{s}</button>
                            ))}
                        </div>
                        <div style={{ flex: 1 }} />
                        {announcementActive && (
                            <button className="btn btn-secondary btn-sm" onClick={clearAnnouncement} disabled={announcementSaving}>
                                <X size={14} /> Take down
                            </button>
                        )}
                        <button className="btn btn-primary btn-sm" onClick={publishAnnouncement} disabled={announcementSaving}>
                            <Megaphone size={14} /> {announcementActive ? 'Update' : 'Publish'}
                        </button>
                    </div>
                </div>
            </section>

            <section className="card">
                <div className="card-header">
                    <div>
                        <div className="card-title">Blocklist</div>
                        <div className="card-subtitle">
                            Drop events from these IP addresses or referring sites, for every domain. Separate entries with commas.
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem', fontWeight: 500 }}>
                        IP addresses
                        <textarea
                            className="input"
                            rows={3}
                            placeholder="192.168.1.1, 10.0.0.5"
                            value={blockedIps}
                            onChange={e => { setBlockedIps(e.target.value); setSecuritySaved(false); }}
                            style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace' }}
                            disabled={saving === 'security'}
                        />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem', fontWeight: 500 }}>
                        Referring sites
                        <textarea
                            className="input"
                            rows={3}
                            placeholder="spam-bot.com, fake-traffic.xyz"
                            value={blockedRefs}
                            onChange={e => { setBlockedRefs(e.target.value); setSecuritySaved(false); }}
                            style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace' }}
                            disabled={saving === 'security'}
                        />
                    </label>
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                    {securitySaved && <span style={{ fontSize: '0.8125rem', color: 'var(--color-success)' }}>Saved</span>}
                    <button className="btn btn-primary" onClick={saveSecurity} disabled={saving === 'security'}>
                        {saving === 'security' ? 'Saving...' : 'Save blocklist'}
                    </button>
                </div>
            </section>
        </div>
    );
}
