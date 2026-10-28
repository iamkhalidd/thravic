'use client';

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Check, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { agency, shareUrl, type ShareLink } from '@/lib/api';
import { useDomain } from '@/contexts/DomainContext';
import { useSubscription } from '@/hooks/useSubscription';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';
import { UpgradeGate } from '@/components/UpgradeGate';

const labelStyle: CSSProperties = {
    display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 6, color: 'var(--color-text-primary)',
};

const EXPIRY_CHOICES: { days: number | null; label: string }[] = [
    { days: null, label: 'Never' },
    { days: 7, label: 'In 7 days' },
    { days: 30, label: 'In 30 days' },
    { days: 90, label: 'In 90 days' },
    { days: 365, label: 'In a year' },
];

const STATE_LABELS: Record<ShareLink['state'], string> = { active: 'Active', revoked: 'Switched off', expired: 'Expired' };

function when(value: string | null): string {
    return value ? new Date(value).toLocaleDateString() : '—';
}

/** Settings → Client links (Agency plan): read-only dashboards for clients, no account needed. */
export default function ClientLinksPage() {
    const { selectedDomainId, selectedDomain } = useDomain();
    const { hasFeature, loading: subLoading } = useSubscription();
    const enabled = hasFeature('client_links', selectedDomain?.features || undefined);

    const [links, setLinks] = useState<ShareLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [label, setLabel] = useState('');
    const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
    const [allowRecordings, setAllowRecordings] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // The full address of a link just made: the only time it can be shown
    const [created, setCreated] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const load = useCallback(async () => {
        if (!selectedDomainId) return;
        setLoading(true);
        const result = await agency.listLinks(selectedDomainId);
        if (result.data) setLinks(result.data);
        else setError(result.error || 'Could not load links');
        setLoading(false);
    }, [selectedDomainId]);

    useEffect(() => {
        setCreated(null);
        setError(null);
        if (enabled) load();
    }, [enabled, load]);

    const create = async (e: FormEvent) => {
        e.preventDefault();
        if (!selectedDomainId) return;
        setSaving(true);
        setError(null);
        const result = await agency.createLink(selectedDomainId, { label: label.trim(), allowRecordings, expiresInDays });
        setSaving(false);
        if (result.error || !result.data?.token) {
            setError(result.error || 'Could not create the link');
            return;
        }
        setCreated(shareUrl(result.data.token));
        setCopied(false);
        setLabel('');
        setAllowRecordings(false);
        load();
    };

    const copy = async () => {
        if (!created) return;
        try {
            await navigator.clipboard.writeText(created);
            setCopied(true);
        } catch {
            setError('Copy failed. Select the address and copy it by hand.');
        }
    };

    const revoke = async (link: ShareLink) => {
        if (!selectedDomainId) return;
        if (!window.confirm(`Switch off "${link.label || 'this link'}"? Anyone using it loses access straight away.`)) return;
        const result = await agency.revokeLink(selectedDomainId, link.id);
        if (result.error) setError(result.error);
        else load();
    };

    const header = (
        <PageHeader
            title="Client links"
            subtitle="A private, read-only dashboard you can send to a client. They don't need an account, and you can switch it off any time."
        />
    );

    if (subLoading) return <div className="page-stack">{header}</div>;
    if (!enabled) {
        return (
            <div className="page-stack">
                {header}
                <UpgradeGate feature="client_links" requiredPlan="agency" message="Give each client a branded, read-only view of their site's numbers." />
            </div>
        );
    }
    if (!selectedDomainId) {
        return (
            <div className="page-stack">
                {header}
                <div className="card"><div className="empty-note">Select a site first.</div></div>
            </div>
        );
    }

    const active = links.filter(l => l.state === 'active');
    const inactive = links.filter(l => l.state !== 'active');

    return (
        <div className="page-stack">
            {header}

            <ChartCard
                title="New link"
                subtitle={`Shows ${selectedDomain?.name || selectedDomain?.domain || 'this site'}'s visitors, sources, pages and latest report, in your branding. Never settings, other sites, or anything that can be changed.`}
            >
                <form onSubmit={create}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                        <div style={{ flex: '2 1 240px', minWidth: 0 }}>
                            <label style={labelStyle} htmlFor="link-label">Name <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(only you see this)</span></label>
                            <input
                                id="link-label"
                                className="input"
                                maxLength={80}
                                placeholder="e.g. Jane at Acme"
                                value={label}
                                onChange={e => setLabel(e.target.value)}
                            />
                        </div>
                        <div style={{ flex: '1 1 160px' }}>
                            <label style={labelStyle} htmlFor="link-expiry">Stops working</label>
                            <select
                                id="link-expiry"
                                className="input"
                                value={expiresInDays ?? ''}
                                onChange={e => setExpiresInDays(e.target.value ? Number(e.target.value) : null)}
                            >
                                {EXPIRY_CHOICES.map(c => <option key={c.label} value={c.days ?? ''}>{c.label}</option>)}
                            </select>
                        </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer', marginBottom: 12 }}>
                        <input type="checkbox" checked={allowRecordings} onChange={e => setAllowRecordings(e.target.checked)} />
                        Let them watch session recordings too
                    </label>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                        <Plus size={16} />
                        {saving ? 'Creating…' : 'Create link'}
                    </button>
                </form>

                {created && (
                    <div role="status" style={{ marginTop: 16, padding: 12, border: '1px solid var(--color-border)', borderRadius: 8 }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 500, marginBottom: 8 }}>
                            Copy this address now: for safety it won&apos;t be shown again.
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <input className="input" readOnly value={created} onFocus={e => e.target.select()} style={{ flex: '1 1 280px', minWidth: 0, fontFamily: 'monospace', fontSize: '0.8125rem' }} />
                            <button type="button" className="btn btn-secondary" onClick={copy}>
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                            <a className="btn btn-ghost" href={created} target="_blank" rel="noopener noreferrer">
                                <ExternalLink size={14} /> Open
                            </a>
                        </div>
                    </div>
                )}

                {error && (
                    <p role="alert" style={{ fontSize: '0.8125rem', color: 'var(--color-error)', margin: '12px 0 0' }}>{error}</p>
                )}
            </ChartCard>

            <ChartCard flush title="Links for this site" loading={loading} height={120}>
                {links.length ? (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left' }}>Name</th>
                                    <th style={{ textAlign: 'left' }}>Status</th>
                                    <th style={{ textAlign: 'left' }}>Recordings</th>
                                    <th style={{ textAlign: 'left' }}>Created</th>
                                    <th style={{ textAlign: 'left' }}>Last opened</th>
                                    <th style={{ textAlign: 'left' }}>Stops</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {[...active, ...inactive].map(link => (
                                    <tr key={link.id} style={{ opacity: link.state === 'active' ? 1 : 0.6 }}>
                                        <td>{link.label || 'Untitled link'}</td>
                                        <td>{STATE_LABELS[link.state]}</td>
                                        <td>{link.allowRecordings ? 'Yes' : 'No'}</td>
                                        <td>{when(link.createdAt)}</td>
                                        <td>{when(link.lastUsedAt)}</td>
                                        <td>{link.revokedAt ? when(link.revokedAt) : link.expiresAt ? when(link.expiresAt) : 'Never'}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {link.state === 'active' && (
                                                <button className="btn btn-ghost" onClick={() => revoke(link)} aria-label={`Switch off ${link.label || 'link'}`}>
                                                    <Trash2 size={14} /> Switch off
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="empty-note" style={{ padding: '0 20px 20px' }}>No links yet.</div>
                )}
            </ChartCard>
        </div>
    );
}
