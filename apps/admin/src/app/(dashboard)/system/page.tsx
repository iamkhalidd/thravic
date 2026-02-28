'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Server, Database, Cpu, HardDrive, RefreshCw } from 'lucide-react';

interface HealthData {
    server: { uptime: number; uptimeFormatted: string; nodeVersion: string; platform: string; pid: number; env: string };
    memory: { rss: string; heapUsed: string; heapTotal: string; external: string };
    database: { pool: { totalCount: number; idleCount: number; waitingCount: number }; size: string; connected: boolean };
}

interface DbStats {
    tables: { table_name: string; row_count: number; total_size: string }[];
    activeConnections: number;
    slowQueries: any[];
}

export default function SystemPage() {
    const [health, setHealth] = useState<HealthData | null>(null);
    const [dbStats, setDbStats] = useState<DbStats | null>(null);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        try {
            const [h, d] = await Promise.all([
                api.get<HealthData>('/api/admin/system/health'),
                api.get<DbStats>('/api/admin/system/db-stats'),
            ]);
            setHealth(h);
            setDbStats(d);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    if (loading) return <div className="loading"><div className="spinner" /></div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-lg)' }}>
                <button className="btn btn-ghost" onClick={loadData}><RefreshCw size={14} /> Refresh</button>
            </div>

            {/* Server & Memory */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(108,92,231,0.12)' }}><Server size={22} color="#6c5ce7" /></div>
                    <div><div className="stat-value" style={{ fontSize: '18px' }}>{health?.server.uptimeFormatted}</div><div className="stat-label">Uptime</div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(0,214,143,0.12)' }}><Cpu size={22} color="#00d68f" /></div>
                    <div><div className="stat-value" style={{ fontSize: '18px' }}>{health?.memory.heapUsed}</div><div className="stat-label">Heap Used</div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(0,188,212,0.12)' }}><HardDrive size={22} color="#00bcd4" /></div>
                    <div><div className="stat-value" style={{ fontSize: '18px' }}>{health?.database.size}</div><div className="stat-label">Database Size</div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(255,170,0,0.12)' }}><Database size={22} color="#ffaa00" /></div>
                    <div><div className="stat-value" style={{ fontSize: '18px' }}>{health?.database.pool.totalCount}</div><div className="stat-label">DB Connections</div></div>
                </div>
            </div>

            {/* Server info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
                <div className="card">
                    <div className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Server Info</div>
                    {[
                        ['Node.js', health?.server.nodeVersion],
                        ['Platform', health?.server.platform],
                        ['Environment', health?.server.env],
                        ['PID', health?.server.pid],
                        ['Last Restarted', health?.server.restartedAt ? new Date(health.server.restartedAt).toLocaleString() : '—'],
                        ['RSS Memory', health?.memory.rss],
                        ['External Memory', health?.memory.external],
                        ['DB Connected', health?.database.connected ? '✅ Yes' : '❌ No'],
                    ].map(([label, value]) => (
                        <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)', fontSize: '14px' }}>
                            <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                            <span style={{ fontWeight: 500, fontFamily: 'monospace' }}>{String(value)}</span>
                        </div>
                    ))}
                </div>

                <div className="card">
                    <div className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Connection Pool</div>
                    {[
                        ['Total', health?.database.pool.totalCount],
                        ['Idle', health?.database.pool.idleCount],
                        ['Waiting', health?.database.pool.waitingCount],
                        ['Active Queries', dbStats?.activeConnections],
                    ].map(([label, value]) => (
                        <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)', fontSize: '14px' }}>
                            <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                            <span style={{ fontWeight: 500 }}>{String(value ?? 0)}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Database tables */}
            <div className="card">
                <div className="card-header"><span className="card-title">Table Sizes</span></div>
                <table className="data-table">
                    <thead><tr><th>Table</th><th>Rows</th><th>Size</th></tr></thead>
                    <tbody>
                        {dbStats?.tables.map((t) => (
                            <tr key={t.table_name}>
                                <td style={{ fontWeight: 500, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{t.table_name}</td>
                                <td>{t.row_count?.toLocaleString()}</td>
                                <td>{t.total_size}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
