'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';

interface AuditEntry {
    id: string;
    admin_email: string | null;
    admin_name: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details: any;
    ip_address: string | null;
    created_at: string;
}

const actionColors: Record<string, string> = {
    'user.update': '#6c5ce7', 'user.delete': '#ff4757', 'user.reset_password': '#ffaa00',
    'domain.update': '#00bcd4', 'domain.transfer': '#a29bfe', 'domain.delete': '#ff4757',
    'subscription.override': '#00d68f',
    'settings.update': '#ffaa00',
    'retention.update': '#00bcd4', 'retention.cleanup': '#ff6b6b',
    'export.user': '#6c5ce7', 'export.domain': '#6c5ce7'
};

export default function AuditPage() {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [action, setAction] = useState('');
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [viewEntry, setViewEntry] = useState<AuditEntry | null>(null);
    const limit = 50;

    const loadData = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (action) params.set('action', action);
            const data = await api.get(`/api/admin/audit?${params}`);
            setEntries(data.entries);
            setTotal(data.total);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, [offset, action]);

    return (
        <div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', alignItems: 'center' }}>
                <select className="input" style={{ width: '200px' }} value={action} onChange={e => { setAction(e.target.value); setOffset(0); }}>
                    <option value="">All Actions</option>
                    <option value="user.update">User Update</option>
                    <option value="user.delete">User Delete</option>
                    <option value="user.reset_password">Password Reset</option>
                    <option value="domain.update">Domain Update</option>
                    <option value="domain.transfer">Domain Transfer</option>
                    <option value="domain.delete">Domain Delete</option>
                    <option value="subscription.override">Subscription Override</option>
                    <option value="settings.update">Settings Update</option>
                    <option value="retention.cleanup">Data Cleanup</option>
                    <option value="export.user">User Export</option>
                    <option value="export.domain">Domain Export</option>
                </select>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>{total} entries</span>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Admin</th>
                            <th>Action</th>
                            <th>Target</th>
                            <th>IP</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="loading"><div className="spinner" /></td></tr>
                        ) : entries.length === 0 ? (
                            <tr><td colSpan={6} className="empty-state">No audit entries</td></tr>
                        ) : (
                            entries.map(entry => (
                                <tr key={entry.id}>
                                    <td style={{ whiteSpace: 'nowrap', fontSize: '13px' }}>{new Date(entry.created_at).toLocaleString()}</td>
                                    <td style={{ fontWeight: 500 }}>{entry.admin_name || entry.admin_email || 'Deleted user'}</td>
                                    <td>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            background: `${actionColors[entry.action] || '#666'}18`,
                                            color: actionColors[entry.action] || '#666',
                                            padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600
                                        }}>
                                            {entry.action}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                                        {entry.target_type && <span>{entry.target_type}</span>}
                                        {entry.target_id && <span style={{ color: 'var(--color-text-muted)' }}> {entry.target_id.slice(0, 8)}…</span>}
                                    </td>
                                    <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>{entry.ip_address || '—'}</td>
                                    <td>
                                        {entry.details && (
                                            <button className="btn btn-ghost btn-sm" onClick={() => setViewEntry(entry)}>
                                                <FileText size={14} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                <div className="pagination" style={{ padding: 'var(--space-md) var(--space-lg)' }}>
                    <span>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button className="btn btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - limit))}><ChevronLeft size={14} /> Prev</button>
                        <button className="btn btn-ghost btn-sm" disabled={offset + limit >= total} onClick={() => setOffset(o => o + limit)}>Next <ChevronRight size={14} /></button>
                    </div>
                </div>
            </div>

            {viewEntry && (
                <div className="modal-overlay" onClick={() => setViewEntry(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3 className="modal-title">Audit Entry Details</h3>
                        <pre style={{
                            background: 'var(--color-bg-tertiary)', padding: 'var(--space-md)',
                            borderRadius: 'var(--radius-md)', overflow: 'auto', maxHeight: '300px', fontSize: '12px'
                        }}>
                            {JSON.stringify(viewEntry.details, null, 2)}
                        </pre>
                        <button className="btn btn-ghost" onClick={() => setViewEntry(null)} style={{ marginTop: 'var(--space-md)' }}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
