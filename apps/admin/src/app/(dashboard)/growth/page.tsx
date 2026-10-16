'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MaskedEmail } from '@/components/MaskedEmail';

interface Account {
    id?: string;
    user_id?: string;
    email: string;
    name?: string | null;
    plan?: string;
    created_at?: string;
    lapsed_at?: string;
    stage?: 'no_domain' | 'no_events';
}

interface Growth {
    days: number;
    funnel: { signedUp: number; addedDomain: number; firstEvent: number; paid: number };
    churn: { count: number; rate: number; accounts: Account[] };
    stuck: Account[];
    timezone: string;
}

const WINDOWS = [30, 90, 180, 365];

function pct(part: number, whole: number) {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function shortDate(value?: string) {
    return value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export default function GrowthPage() {
    const [days, setDays] = useState(90);
    const [data, setData] = useState<Growth | null>(null);
    const [failed, setFailed] = useState('');

    useEffect(() => {
        setData(null);
        setFailed('');
        api.get<Growth>(`/api/admin/growth?days=${days}`).then(setData).catch((e: Error) => setFailed(e.message));
    }, [days]);

    if (failed) return <div className="card empty-note">Growth could not be loaded: {failed}</div>;

    const f = data?.funnel;
    const steps = f ? [
        { label: 'Signed up', value: f.signedUp, of: f.signedUp },
        { label: 'Added a site', value: f.addedDomain, of: f.signedUp },
        { label: 'Sent a first event', value: f.firstEvent, of: f.addedDomain },
        { label: 'Paid', value: f.paid, of: f.firstEvent },
    ] : [];

    return (
        <div className="page-stack">
            <div className="card">
                <div className="card-header">
                    <div>
                        <div className="card-title">Sign-up funnel</div>
                        <div className="card-subtitle">Accounts that signed up in the last {days} days, and how far they got. Admin accounts are left out.</div>
                    </div>
                    <select className="input" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 140 }} aria-label="Time window">
                        {WINDOWS.map(w => <option key={w} value={w}>Last {w} days</option>)}
                    </select>
                </div>
                {!data ? <div className="skeleton" style={{ height: 160 }} /> : (
                    <div style={{ display: 'grid', gap: 12 }}>
                        {steps.map((s, i) => {
                            const width = pct(s.value, f!.signedUp);
                            return (
                                <div key={s.label}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: 4 }}>
                                        <span>{s.label}</span>
                                        <span className="muted">
                                            <strong style={{ color: 'var(--color-text-primary)' }}>{s.value.toLocaleString()}</strong>
                                            {i > 0 && ` · ${pct(s.value, s.of)}% of the step before`}
                                        </span>
                                    </div>
                                    <div style={{ height: 10, borderRadius: 5, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                        <div style={{ width: `${width}%`, height: '100%', background: 'var(--brand)', borderRadius: 5 }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="card">
                <div className="card-header">
                    <div>
                        <div className="card-title">Stopped paying this month</div>
                        <div className="card-subtitle">
                            Paid plans whose period and grace days ran out since the 1st without a renewal
                            {data ? ` · ${data.churn.rate}% of paying accounts` : ''}.
                        </div>
                    </div>
                </div>
                {!data ? <div className="skeleton" style={{ height: 80 }} /> : data.churn.accounts.length === 0 ? (
                    <p className="empty-note">Nobody has stopped paying this month.</p>
                ) : (
                    <div className="table-scroll">
                        <table className="data-table">
                            <thead><tr><th>Account</th><th>Plan</th><th>Lapsed</th></tr></thead>
                            <tbody>
                                {data.churn.accounts.map(a => (
                                    <tr key={a.user_id}>
                                        <td>{a.name || '—'} <span className="muted"><MaskedEmail email={a.email} /></span></td>
                                        <td style={{ textTransform: 'capitalize' }}>{a.plan}</td>
                                        <td className="muted">{shortDate(a.lapsed_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="card">
                <div className="card-header">
                    <div>
                        <div className="card-title">Stuck accounts</div>
                        <div className="card-subtitle">Signed up more than 2 days ago and have never sent an event. These are the people worth a friendly email.</div>
                    </div>
                </div>
                {!data ? <div className="skeleton" style={{ height: 80 }} /> : data.stuck.length === 0 ? (
                    <p className="empty-note">No one is stuck.</p>
                ) : (
                    <div className="table-scroll">
                        <table className="data-table">
                            <thead><tr><th>Account</th><th>Where they stopped</th><th>Signed up</th></tr></thead>
                            <tbody>
                                {data.stuck.map(a => (
                                    <tr key={a.id}>
                                        <td>{a.name || '—'} <span className="muted"><MaskedEmail email={a.email} /></span></td>
                                        <td>{a.stage === 'no_domain' ? 'Has not added a site' : 'Site added, no events yet'}</td>
                                        <td className="muted">{shortDate(a.created_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
