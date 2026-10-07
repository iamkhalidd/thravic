'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDomain } from '@/contexts/DomainContext';
import { useSubscription } from '@/hooks/useSubscription';
import { UpgradeGate } from '@/components/UpgradeGate';
import { Webhook as WebhookIcon, Plus, Trash2, KeyRound } from 'lucide-react';
import { webhooks, WEBHOOK_EVENTS, type Webhook, type WebhookEvent } from '@/lib/api';

const EVENT_LABELS: Record<WebhookEvent, string> = {
    pageview: 'Page views',
    click: 'Clicks',
    scroll: 'Scroll depth',
    form: 'Form submissions',
    custom: 'Custom events',
    session_end: 'Session ends',
};

export default function WebhooksPage() {
    const { selectedDomainId, selectedDomain } = useDomain();
    const { hasFeature, loading: subLoading } = useSubscription();
    const enabled = hasFeature('webhooks', selectedDomain?.features || undefined);

    const [list, setList] = useState<Webhook[]>([]);
    const [loading, setLoading] = useState(true);
    const [url, setUrl] = useState('');
    const [secret, setSecret] = useState('');
    const [events, setEvents] = useState<WebhookEvent[]>(['pageview']);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!selectedDomainId) return;
        setLoading(true);
        const result = await webhooks.list(selectedDomainId);
        setList(result.data || []);
        if (result.error) setMessage({ type: 'error', text: result.error });
        setLoading(false);
    }, [selectedDomainId]);

    useEffect(() => {
        if (enabled && selectedDomainId) {
            load();
        } else {
            setLoading(false);
        }
    }, [enabled, selectedDomainId, load]);

    const toggleEvent = (event: WebhookEvent) => {
        setEvents(prev => prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDomainId || !url.trim() || events.length === 0) return;

        setSaving(true);
        setMessage(null);
        const result = await webhooks.create(selectedDomainId, {
            url: url.trim(),
            events,
            secret: secret.trim() || undefined,
        });
        if (result.error) {
            setMessage({ type: 'error', text: result.error });
        } else if (result.data) {
            setList(prev => [result.data!, ...prev]);
            setUrl('');
            setSecret('');
            setMessage({ type: 'success', text: 'Webhook added' });
        }
        setSaving(false);
    };

    const handleRemove = async (webhookId: string) => {
        if (!selectedDomainId || !confirm('Delete this webhook? It stops receiving events immediately.')) return;
        setRemovingId(webhookId);
        const result = await webhooks.delete(selectedDomainId, webhookId);
        if (result.error) {
            setMessage({ type: 'error', text: result.error });
        } else {
            setList(prev => prev.filter(w => w.id !== webhookId));
        }
        setRemovingId(null);
    };

    if (!subLoading && !enabled) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <div>
                        <h2 className="page-title">Webhooks</h2>
                        <p className="page-subtitle">Send tracked events to your own systems</p>
                    </div>
                </div>
                <UpgradeGate feature="webhooks" requiredPlan="pro"
                    message="Forward page views, clicks and custom events to your own endpoints as they happen. Upgrade to Pro to unlock webhooks." />
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <WebhookIcon size={24} /> Webhooks
                    </h2>
                    <p className="page-subtitle">
                        Send events from <strong>{selectedDomain?.domain || 'your domain'}</strong> to your own endpoints as they are collected
                    </p>
                </div>
            </div>

            {/* Add form */}
            <div className="card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={18} /> Add a Webhook
                </h3>
                <form onSubmit={handleCreate}>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
                        <div style={{ flex: '2 1 280px' }}>
                            <label style={labelStyle} htmlFor="webhook-url">Endpoint URL</label>
                            <input
                                id="webhook-url"
                                className="input"
                                type="url"
                                placeholder="https://example.com/hooks/thravic"
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                required
                            />
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={labelStyle} htmlFor="webhook-secret">Signing secret (optional)</label>
                            <input
                                id="webhook-secret"
                                className="input"
                                type="password"
                                autoComplete="off"
                                placeholder="Used to sign each request"
                                value={secret}
                                onChange={e => setSecret(e.target.value)}
                            />
                        </div>
                    </div>

                    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 var(--space-md)' }}>
                        <legend style={labelStyle}>Events</legend>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm) var(--space-lg)' }}>
                            {WEBHOOK_EVENTS.map(event => (
                                <label key={event} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={events.includes(event)}
                                        onChange={() => toggleEvent(event)}
                                    />
                                    {EVENT_LABELS[event]}
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={saving || !url.trim() || events.length === 0}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Plus size={16} />
                        {saving ? 'Adding...' : 'Add webhook'}
                    </button>
                </form>

                {message && (
                    <div role="status" style={{
                        marginTop: 'var(--space-sm)', padding: '8px 12px', borderRadius: '6px',
                        fontSize: '0.875rem',
                        background: message.type === 'success' ? 'rgba(0,214,143,0.1)' : 'rgba(255,85,85,0.1)',
                        color: message.type === 'success' ? '#00d68f' : '#ff5555',
                        borderLeft: `3px solid ${message.type === 'success' ? '#00d68f' : '#ff5555'}`,
                    }}>
                        {message.text}
                    </div>
                )}

                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-sm)' }}>
                    Each event is sent as a JSON <code>POST</code> with <code>event</code>, <code>domainId</code>, <code>timestamp</code> and <code>data</code>.
                    With a secret, the <code>X-Thravic-Signature</code> header carries the HMAC-SHA256 of the request body. Endpoints must be publicly reachable.
                </p>
            </div>

            {/* List */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <WebhookIcon size={18} /> Endpoints ({list.length})
                    </h3>
                </div>

                {loading ? (
                    <div className="loading" style={{ padding: '3rem' }}><div className="spinner" /></div>
                ) : list.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <WebhookIcon size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                        <p>No webhooks yet.</p>
                        <p style={{ fontSize: '0.85rem' }}>Add an endpoint above to start receiving events.</p>
                    </div>
                ) : (
                    <div>
                        {list.map(webhook => (
                            <div
                                key={webhook.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                                    padding: 'var(--space-md) var(--space-lg)',
                                    borderBottom: '1px solid var(--color-border)',
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {webhook.url}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: '2px' }}>
                                        <span>{webhook.events.map(e => EVENT_LABELS[e] ?? e).join(', ')}</span>
                                        {webhook.hasSecret && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <KeyRound size={12} /> Signed
                                            </span>
                                        )}
                                        {!webhook.enabled && <span>Disabled</span>}
                                    </div>
                                </div>

                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                                    {new Date(webhook.created_at).toLocaleDateString()}
                                </div>

                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => handleRemove(webhook.id)}
                                    disabled={removingId === webhook.id}
                                    title="Delete webhook"
                                    aria-label={`Delete webhook ${webhook.url}`}
                                    style={{ color: '#ff5555' }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.8rem', fontWeight: 500,
    color: 'var(--color-text-secondary)', marginBottom: '4px',
};
