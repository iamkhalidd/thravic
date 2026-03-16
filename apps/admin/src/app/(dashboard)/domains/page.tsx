'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Search, ChevronLeft, ChevronRight, Edit, Trash2, ArrowRightLeft, CheckCircle, XCircle, Download } from 'lucide-react';

interface Domain {
    id: string;
    domain: string;
    name: string;
    tracking_id: string;
    verified: boolean;
    owner_email: string;
    owner_name: string;
    events_30d: string;
    members_count: string;
    created_at: string;
}

export default function DomainsPage() {
    const [domains, setDomains] = useState<Domain[]>([]);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const limit = 25;

    const loadDomains = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (search) params.set('search', search);
            const data = await api.get(`/api/admin/domains?${params}`);
            setDomains(data.domains);
            setTotal(data.total);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadDomains(); }, [offset]);

    const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setOffset(0); loadDomains(); };

    const handleVerify = async (domain: Domain) => {
        try {
            await api.patch(`/api/admin/domains/${domain.id}`, { verified: !domain.verified });
            loadDomains();
        } catch (err: any) { alert(err.message); }
    };

    const handleTransfer = async (domain: Domain) => {
        const newUserId = prompt(`Enter the new owner's User ID for "${domain.domain}":`);
        if (!newUserId) return;
        try {
            await api.post(`/api/admin/domains/${domain.id}/transfer`, { newUserId });
            alert('Domain transferred');
            loadDomains();
        } catch (err: any) { alert(err.message); }
    };

    const handleDelete = async (domain: Domain) => {
        if (!confirm(`Delete domain "${domain.domain}"? All data will be lost.`)) return;
        try {
            await api.delete(`/api/admin/domains/${domain.id}`);
            loadDomains();
        } catch (err: any) { alert(err.message); }
    };

    const handleExport = async (domain: Domain) => {
        try {
            const data = await api.post(`/api/admin/export/domain/${domain.id}`, {});
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `export_domain_${domain.domain}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            alert('Export failed: ' + err.message);
        }
    };

    return (
        <div>
            <form onSubmit={handleSearch} className="search-bar" style={{ marginBottom: 'var(--space-lg)' }}>
                <Search size={16} />
                <input type="text" placeholder="Search domains, names, or owner emails..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </form>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Domain</th>
                            <th>Owner</th>
                            <th>Tracking ID</th>
                            <th>Verified</th>
                            <th>Events (30d)</th>
                            <th>Members</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} className="loading"><div className="spinner" /></td></tr>
                        ) : domains.length === 0 ? (
                            <tr><td colSpan={8} className="empty-state">No domains found</td></tr>
                        ) : (
                            domains.map((d) => (
                                <tr key={d.id}>
                                    <td style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{d.domain}</td>
                                    <td>{d.owner_name}<br /><span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{d.owner_email}</span></td>
                                    <td><code style={{ fontSize: '12px', background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>{d.tracking_id}</code></td>
                                    <td>{d.verified ? <CheckCircle size={16} color="var(--color-success)" /> : <XCircle size={16} color="var(--color-text-muted)" />}</td>
                                    <td>{parseInt(d.events_30d).toLocaleString()}</td>
                                    <td>{d.members_count}</td>
                                    <td>{new Date(d.created_at).toLocaleDateString()}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleVerify(d)} title={d.verified ? 'Unverify' : 'Verify'}>
                                                {d.verified ? <XCircle size={14} /> : <CheckCircle size={14} />}
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleTransfer(d)} title="Transfer">
                                                <ArrowRightLeft size={14} />
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleExport(d)} title="Export Domain Data">
                                                <Download size={14} />
                                            </button>
                                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d)} title="Delete">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                <div className="pagination" style={{ padding: 'var(--space-md) var(--space-lg)' }}>
                    <span>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button className="btn btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - limit))}><ChevronLeft size={14} /> Prev</button>
                        <button className="btn btn-ghost btn-sm" disabled={offset + limit >= total} onClick={() => setOffset(o => o + limit)}>Next <ChevronRight size={14} /></button>
                    </div>
                </div>
            </div>
        </div>
    );
}
