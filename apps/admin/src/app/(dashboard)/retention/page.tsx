'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Database, Trash2, Save } from 'lucide-react';

interface Policy {
    id: string;
    plan: string;
    events_days: number;
    sessions_days: number;
    recordings_days: number;
    heatmaps_days: number;
    expiredEventsCount: number;
}

export default function RetentionPage() {
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [cleaning, setCleaning] = useState(false);
    const [editForms, setEditForms] = useState<Record<string, { events_days: number; sessions_days: number; recordings_days: number; heatmaps_days: number }>>({});

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await api.get('/api/admin/retention');
            setPolicies(data.policies);
            const forms: Record<string, any> = {};
            (data.policies as Policy[]).forEach(p => {
                forms[p.plan] = { events_days: p.events_days, sessions_days: p.sessions_days, recordings_days: p.recordings_days, heatmaps_days: p.heatmaps_days };
            });
            setEditForms(forms);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    const handleSave = async (plan: string) => {
        setSaving(plan);
        try {
            await api.put(`/api/admin/retention/${plan}`, editForms[plan]);
            await loadData();
        } catch (err: any) { alert(err.message); }
        finally { setSaving(null); }
    };

    const handleCleanup = async () => {
        if (!confirm('Run data cleanup now? This will permanently delete expired data.')) return;
        setCleaning(true);
        try {
            const result = await api.post('/api/admin/retention/cleanup');
            alert(`Cleanup complete: ${JSON.stringify(result.results, null, 2)}`);
            await loadData();
        } catch (err: any) { alert(err.message); }
        finally { setCleaning(false); }
    };

    if (loading) return <div className="loading"><div className="spinner" /></div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-lg)' }}>
                <button className="btn btn-danger" onClick={handleCleanup} disabled={cleaning}>
                    <Trash2 size={14} /> {cleaning ? 'Running Cleanup...' : 'Run Cleanup Now'}
                </button>
            </div>

            <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                {policies.map(policy => (
                    <div key={policy.id} className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                                <Database size={20} color="var(--color-accent)" />
                                <div>
                                    <span className={`badge badge-${policy.plan}`} style={{ fontSize: '14px' }}>{policy.plan}</span>
                                    {policy.expiredEventsCount > 0 && (
                                        <span style={{ fontSize: '12px', color: 'var(--color-warning)', marginLeft: 'var(--space-sm)' }}>
                                            {policy.expiredEventsCount.toLocaleString()} expired events
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={() => handleSave(policy.plan)} disabled={saving === policy.plan}>
                                <Save size={14} /> {saving === policy.plan ? 'Saving...' : 'Save'}
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-md)' }}>
                            {['events_days', 'sessions_days', 'recordings_days', 'heatmaps_days'].map(field => (
                                <div key={field}>
                                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px', textTransform: 'capitalize' }}>
                                        {field.replace('_', ' ')}
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <input
                                            className="input"
                                            type="number"
                                            value={editForms[policy.plan]?.[field as keyof typeof editForms[string]] ?? 0}
                                            onChange={e => setEditForms(f => ({
                                                ...f,
                                                [policy.plan]: { ...f[policy.plan], [field]: parseInt(e.target.value) }
                                            }))}
                                            style={{ width: '100px' }}
                                        />
                                        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>days</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
