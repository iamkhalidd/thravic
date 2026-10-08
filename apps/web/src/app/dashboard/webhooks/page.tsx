'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDomain } from '@/contexts/DomainContext';
import { useSubscription } from '@/hooks/useSubscription';
import { UpgradeGate } from '@/components/UpgradeGate';
import { Plus, Trash2, KeyRound } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
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
            <div className="page-stack">
                <PageHeader title="Webhooks" subtitle="Send tracked events to your own systems." />
                <UpgradeGate feature="webhooks" requiredPlan="pro"
                    message="Forward page views, clicks and custom events to your own endpoints as they happen. Upgrade to Pro to unlock webhooks." />
            </div>
        );
    }

    return (
        <div className="page-stack">
            <PageHeader
                title="Webhooks"
                subtitle={<>Send events from <strong style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{selectedDomain?.domain || 'your site'}</strong> to your own endpoints as they are collected.</>}
            />

            {/* Add form */}
            <ChartCard title="Add a webhook">
                <form onSubmit={handleCreate}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        <div style={{ flex: '2 1 280px', minWidth: 0 }}>
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
                        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                            <label style={labelStyle} htmlFor="webhook-secret">Signing secret <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
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

                    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
                        <legend style={labelStyle}>Events</legend>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
                            {WEBHOOK_EVENTS.map(event => (
                                <label key={event} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', cursor: 'pointer' }}>
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
                    >
                        <Plus size={16} />
                        {saving ? 'Adding…' : 'Add webhook'}
                    </button>
                </form>

                {message && (
                    <p role={message.type === 'error' ? 'alert' : 'status'} style={{
                        marginTop: 10, fontSize: '0.8125rem',
                        color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
                    }}>
                        {message.text}
                    </p>
                )}

                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 12, lineHeight: 1.5 }}>
                    Each event is sent as a JSON <code>POST</code> with <code>event</code>, <code>domainId</code>, <code>timestamp</code> and <code>data</code>.
                    With a secret, the <code>X-Thravic-Signature</code> header carries the HMAC-SHA256 of the request body. Endpoints must be publicly reachable.
                </p>
            </ChartCard>

            {/* List */}
            <ChartCard flush title="Endpoints" subtitle={loading ? undefined : `${list.length} ${list.length === 1 ? 'endpoint' : 'endpoints'}`}>
                {loading ? (
                    <div className="skeleton" style={{ height: 120, margin: '0 20px 20px' }} />
                ) : list.length === 0 ? (
                    <div className="empty-note">No webhooks yet. Add an endpoint above to start receiving events.</div>
                ) : (
                    <div style={{ overflowX: 'auto', marginTop: 6 }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: 20 }}>Endpoint</th>
                                    <th>Events</th>
                                    <th>Status</th>
                                    <th className="num">Added</th>
                                    <th aria-label="Actions" style={{ width: 52, paddingRight: 20 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {list.map(webhook => (
                                    <tr key={webhook.id}>
                                        <td style={{ paddingLeft: 20, maxWidth: 360 }}>
                                            <div title={webhook.url} style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                                                {webhook.url}
                                            </div>
                                        </td>
                                        <td className="muted" style={{ minWidth: 160 }}>
                                            {webhook.events.map(e => EVENT_LABELS[e] ?? e).join(', ')}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap' }}>
                                            <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                                                {webhook.enabled
                                                    ? <span className="badge badge-success">Active</span>
                                                    : <span className="badge">Disabled</span>}
                                                {webhook.hasSecret && (
                                                    <span className="badge" style={{ gap: 4 }}>
                                                        <KeyRound size={11} aria-hidden="true" /> Signed
                                                    </span>
                                                )}
                                            </span>
                                        </td>
                                        <td className="num muted">{new Date(webhook.created_at).toLocaleDateString()}</td>
                                        <td style={{ paddingRight: 20, textAlign: 'right' }}>
                                            <button
                                                className="btn btn-ghost"
                                                onClick={() => handleRemove(webhook.id)}
                                                disabled={removingId === webhook.id}
                                                title="Delete webhook"
                                                aria-label={`Delete webhook ${webhook.url}`}
                                                style={{ padding: 6, color: 'var(--color-text-secondary)' }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </ChartCard>
        </div>
    );
}

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.8125rem', fontWeight: 500,
    color: 'var(--color-text-secondary)', marginBottom: '4px',
};
