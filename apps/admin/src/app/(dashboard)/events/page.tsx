'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Search, Trash2, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

interface EventItem {
    id: string;
    domain_id: string;
    domain_name: string;
    type: string;
    url: string;
    data: any;
    created_at: string;
}

const typeColors: Record<string, string> = {
    pageview: '#6c5ce7',
    click: '#00d68f',
    scroll: '#00bcd4',
    form: '#ffaa00',
    custom: '#ff6b6b'
};

export default function EventsPage() {
    const [events, setEvents] = useState<EventItem[]>([]);
    const [total, setTotal] = useState(0);
    const [type, setType] = useState('');
    const [url, setUrl] = useState('');
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [viewEvent, setViewEvent] = useState<EventItem | null>(null);
    const limit = 50;

    const loadEvents = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (type) params.set('type', type);
            if (url) params.set('url', url);
            const data = await api.get(`/api/admin/events?${params}`);
            setEvents(data.events);
            setTotal(data.total);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadEvents(); }, [offset, type]);

    const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setOffset(0); loadEvents(); };

    const handlePurge = async () => {
        const before = prompt('Purge events older than (YYYY-MM-DD):');
        if (!before) return;
        if (!confirm(`This will permanently delete events before ${before}. Continue?`)) return;
        try {
            const result = await api.delete('/api/admin/events/purge', { before });
            alert(`Purged ${result.deleted} events`);
            loadEvents();
        } catch (err: any) { alert(err.message); }
    };

    return (
        <div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', alignItems: 'center' }}>
                <form onSubmit={handleSearch} className="search-bar" style={{ flex: 1 }}>
                    <Search size={16} />
                    <input type="text" placeholder="Filter by URL..." value={url} onChange={(e) => setUrl(e.target.value)} />
                </form>
                <select className="input" style={{ width: '140px' }} value={type} onChange={e => { setType(e.target.value); setOffset(0); }}>
                    <option value="">All Types</option>
                    <option value="pageview">Pageview</option>
                    <option value="click">Click</option>
                    <option value="scroll">Scroll</option>
                    <option value="form">Form</option>
                    <option value="custom">Custom</option>
                </select>
                <button className="btn btn-danger" onClick={handlePurge}>
                    <Trash2 size={14} /> Purge Old Events
                </button>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Domain</th>
                            <th>URL</th>
                            <th>Timestamp</th>
                            <th>Detail</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="loading"><div className="spinner" /></td></tr>
                        ) : events.length === 0 ? (
                            <tr><td colSpan={5} className="empty-state">No events found</td></tr>
                        ) : (
                            events.map(event => (
                                <tr key={event.id}>
                                    <td>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            background: `${typeColors[event.type] || '#666'}18`,
                                            color: typeColors[event.type] || '#666',
                                            padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600
                                        }}>
                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: typeColors[event.type] || '#666' }} />
                                            {event.type}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 500 }}>{event.domain_name}</td>
                                    <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.url}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(event.created_at).toLocaleString()}</td>
                                    <td>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setViewEvent(event)} title="View"><Eye size={14} /></button>
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

            {/* Event detail modal */}
            {viewEvent && (
                <div className="modal-overlay" onClick={() => setViewEvent(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3 className="modal-title">Event Detail</h3>
                        <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                            <div><strong>ID:</strong> {viewEvent.id}</div>
                            <div><strong>Type:</strong> {viewEvent.type}</div>
                            <div><strong>URL:</strong> {viewEvent.url}</div>
                            <div><strong>Domain:</strong> {viewEvent.domain_name}</div>
                            <div><strong>Timestamp:</strong> {new Date(viewEvent.created_at).toLocaleString()}</div>
                            <div>
                                <strong>Data:</strong>
                                <pre style={{
                                    background: 'var(--color-bg-tertiary)', padding: 'var(--space-md)',
                                    borderRadius: 'var(--radius-md)', overflow: 'auto', maxHeight: '200px',
                                    marginTop: '4px', fontSize: '12px'
                                }}>
                                    {JSON.stringify(viewEvent.data, null, 2) || 'null'}
                                </pre>
                            </div>
                        </div>
                        <button className="btn btn-ghost" onClick={() => setViewEvent(null)} style={{ marginTop: 'var(--space-lg)' }}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
