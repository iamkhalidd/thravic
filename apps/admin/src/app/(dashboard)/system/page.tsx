'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RefreshCw } from 'lucide-react';

// The API keeps the old Node field names; `nodeVersion` carries the Python version.
// Memory and the pool's waiting count are left out: the Python server cannot measure them.
interface HealthData {
    server: { uptimeFormatted: string; restartedAt: string; nodeVersion: string; env: string };
    database: { pool: { totalCount: number; idleCount: number }; size: string; connected: boolean };
}

interface Job {
    name: string;
    label: string;
    everyMinutes: number;
    status: 'ok' | 'late' | 'failing' | 'never';
    lastRunAt: string | null;
    details: Record<string, unknown> | null;
    lastError: string | null;
    lastErrorAt: string | null;
}

const JOB_BADGE: Record<Job['status'], [string, string]> = {
    ok: ['badge-success', 'OK'],
    late: ['badge-warning', 'Late'],
    failing: ['badge-error', 'Failing'],
    never: ['badge', 'Not run yet'],
};

function every(minutes: number) {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

/** The job's last result, as short `key: value` pairs. */
function summary(details: Job['details']) {
    if (!details) return '';
    return Object.entries(details)
        .filter(([, v]) => typeof v !== 'object' || v === null)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
}

interface DbStats {
    tables: { table_name: string; row_count: number; total_size: string }[];
    activeConnections: number;
}

export default function SystemPage() {
    const [health, setHealth] = useState<HealthData | null>(null);
    const [dbStats, setDbStats] = useState<DbStats | null>(null);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        try {
            const [h, d, j] = await Promise.all([
                api.get<HealthData>('/api/admin/system/health'),
                api.get<DbStats>('/api/admin/system/db-stats'),
                api.get<{ jobs: Job[] }>('/api/admin/system/jobs').catch(() => ({ jobs: [] })),
            ]);
            setHealth(h);
            setDbStats(d);
            setJobs(j.jobs);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    if (loading) return <div className="loading"><div className="spinner" /></div>;
    if (!health) return <div className="card empty-note">System health could not be loaded.</div>;

    const pool = health.database.pool;
    const tiles = [
        { label: 'API uptime', value: health.server.uptimeFormatted, hint: `Since ${new Date(health.server.restartedAt).toLocaleString()}` },
        {
            label: 'Database',
            value: health.database.connected ? 'Connected' : 'Unreachable',
            hint: `${health.database.size} on disk`,
            tone: health.database.connected ? 'var(--color-success)' : 'var(--color-danger)',
        },
        { label: 'Connections', value: String(pool.totalCount), hint: `${pool.idleCount} idle, ${dbStats?.activeConnections ?? 0} running queries` },
        { label: 'Runtime', value: `Python ${health.server.nodeVersion.replace(/^v/, '')}`, hint: `Environment: ${health.server.env}` },
    ];

    return (
        <div className="page-stack">
            <div className="stat-grid">
                {tiles.map(t => (
                    <div key={t.label} className="stat-card">
                        <span className="stat-label">{t.label}</span>
                        <span className="stat-value" style={{ fontSize: '1.25rem', color: t.tone }}>{t.value}</span>
                        <span className="stat-hint">{t.hint}</span>
                    </div>
                ))}
            </div>

            <div className="card card-flush">
                <div className="card-header">
                    <div>
                        <div className="card-title">Scheduled jobs</div>
                        <div className="card-subtitle">
                            Emails, alerts, billing checks and clean-up. Late can also mean the server was asleep; a job runs when it wakes.
                        </div>
                    </div>
                </div>
                <div className="table-scroll" style={{ marginTop: 8 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: 20 }}>Job</th>
                                <th>Status</th>
                                <th>Every</th>
                                <th>Last run</th>
                                <th style={{ paddingRight: 20 }}>Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jobs.map(j => {
                                const [badge, text] = JOB_BADGE[j.status];
                                return (
                                    <tr key={j.name}>
                                        <td style={{ paddingLeft: 20 }}>{j.label}</td>
                                        <td><span className={`badge ${badge}`}>{text}</span></td>
                                        <td className="muted">{every(j.everyMinutes)}</td>
                                        <td className="muted">{j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : '—'}</td>
                                        <td style={{ paddingRight: 20, fontSize: 13 }}>
                                            {j.status === 'failing' && j.lastError ? (
                                                <span style={{ color: 'var(--color-danger)' }} title={j.lastErrorAt ? new Date(j.lastErrorAt).toLocaleString() : ''}>
                                                    {j.lastError}
                                                </span>
                                            ) : (
                                                <span className="muted">{summary(j.details)}</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card card-flush">
                <div className="card-header">
                    <div>
                        <div className="card-title">Tables</div>
                        <div className="card-subtitle">Rows and size on disk, including indexes</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={loadData}><RefreshCw size={14} /> Refresh</button>
                </div>
                <div className="table-scroll" style={{ marginTop: 8 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: 20 }}>Table</th>
                                <th className="num">Rows</th>
                                <th className="num" style={{ paddingRight: 20 }}>Size</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dbStats?.tables.map(t => (
                                <tr key={t.table_name}>
                                    <td style={{ paddingLeft: 20, fontFamily: 'ui-monospace, monospace' }}>{t.table_name}</td>
                                    <td className="num">{t.row_count?.toLocaleString()}</td>
                                    <td className="num muted" style={{ paddingRight: 20 }}>{t.total_size}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
