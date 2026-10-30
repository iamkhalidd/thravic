'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RefreshCw } from 'lucide-react';
import { MaskedEmail } from '@/components/MaskedEmail';

interface Store {
    domain_id: string;
    domain: string;
    site_name: string | null;
    user_id: string;
    owner_email: string;
    plan: string;
    first_seen: string;
    last_seen: string;
    events_7d: number;
    events_30d: number;
    active: boolean;
}

interface StoresData {
    stores: Store[];
    lookbackDays: number;
    activeWithinDays: number;
}

const day = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString();

export default function IntegrationsPage() {
    const [data, setData] = useState<StoresData | null>(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try { setData(await api.get<StoresData>('/api/admin/integrations/shopify')); }
        catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    if (loading && !data) return <div className="loading"><div className="spinner" /></div>;
    if (!data) return <div className="card empty-note">Shopify stores could not be loaded.</div>;

    const active = data.stores.filter(s => s.active).length;
    const tiles = [
        { label: 'Stores', value: String(data.stores.length), hint: `Sent Shopify events in the last ${data.lookbackDays} days` },
        { label: 'Active', value: String(active), hint: `Events in the last ${data.activeWithinDays} days` },
        { label: 'Quiet', value: String(data.stores.length - active), hint: 'May have removed the app or lost the tracking ID' },
    ];

    return (
        <div className="page-stack">
            <div className="stat-grid">
                {tiles.map(t => (
                    <div key={t.label} className="stat-card">
                        <span className="stat-label">{t.label}</span>
                        <span className="stat-value" style={{ fontSize: '1.25rem' }}>{t.value}</span>
                        <span className="stat-hint">{t.hint}</span>
                    </div>
                ))}
            </div>

            <div className="card card-flush">
                <div className="card-header">
                    <div>
                        <div className="card-title">Shopify stores</div>
                        <div className="card-subtitle">
                            Sites that receive events from the Thravic Shopify app. Counted hourly from the daily totals.
                        </div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
                </div>
                <div className="table-scroll" style={{ marginTop: 8 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: 20 }}>Store</th>
                                <th>Owner</th>
                                <th>Status</th>
                                <th className="num">Events, 7 days</th>
                                <th className="num">Events, 30 days</th>
                                <th>First seen</th>
                                <th style={{ paddingRight: 20 }}>Last seen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.stores.length === 0 ? (
                                <tr><td colSpan={7} className="empty-state">No store has sent events from the Shopify app yet</td></tr>
                            ) : data.stores.map(s => (
                                <tr key={s.domain_id}>
                                    <td style={{ paddingLeft: 20 }}>
                                        <div style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{s.site_name || s.domain}</div>
                                        {s.site_name && <div className="muted" style={{ fontSize: 12 }}>{s.domain}</div>}
                                    </td>
                                    <td>
                                        <MaskedEmail email={s.owner_email} />
                                        <div><span className="badge">{s.plan}</span></div>
                                    </td>
                                    <td>
                                        <span className={`badge ${s.active ? 'badge-success' : 'badge-warning'}`}>{s.active ? 'Active' : 'Quiet'}</span>
                                    </td>
                                    <td className="num">{s.events_7d.toLocaleString()}</td>
                                    <td className="num">{s.events_30d.toLocaleString()}</td>
                                    <td className="muted">{day(s.first_seen)}</td>
                                    <td className="muted" style={{ paddingRight: 20 }}>{day(s.last_seen)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
