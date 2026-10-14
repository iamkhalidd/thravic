'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Globe, Loader, Smartphone, Trash2 } from 'lucide-react';
import { useDomain } from '@/contexts/DomainContext';
import { domains } from '@/lib/api';
import { isApp } from '@/lib/platform';
import type { Domain } from '@/types';

/** Settings → Sites: every site and app on the account, and deleting one. */
export function SitesSettings() {
    const { domains: list, refresh } = useDomain();
    // Deleting asks for the domain (or bundle ID) to be typed, so a slip can't do it.
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startDelete = (id: string) => {
        setConfirmingId(id);
        setConfirmation('');
        setError(null);
    };

    const deleteSite = async (site: Domain) => {
        if (confirmation.trim() !== site.domain) return;
        setDeleting(true);
        setError(null);
        const { error } = await domains.delete(site.id);
        if (error) {
            setError(error);
        } else {
            setConfirmingId(null);
            // The context moves the selection to another site, or to none.
            await refresh();
        }
        setDeleting(false);
    };

    return (
        <div className="card">
            <h2 className="card-title">Sites and apps</h2>
            <p className="card-subtitle" style={{ marginBottom: 12 }}>
                Deleting a site or app removes everything collected for it: page views, sessions, recordings,
                heatmaps, funnels and webhooks. This can&apos;t be undone. It also frees a slot on your plan.
            </p>

            {list.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                    No sites yet. <Link href="/dashboard/domains/new" style={{ color: 'var(--color-accent-primary)' }}>Add a website or app</Link>
                </p>
            ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--color-border)' }}>
                    {list.map(site => {
                        const app = isApp(site);
                        const Icon = app ? Smartphone : Globe;
                        const kind = app ? 'app' : 'site';
                        const confirming = confirmingId === site.id;
                        return (
                            <li key={site.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <Icon size={16} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} aria-hidden="true" />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {(app && site.name) || site.domain}
                                        </div>
                                        {app && site.name && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{site.domain}</div>
                                        )}
                                    </div>
                                    {/* Only the owner can delete; the API refuses team members too. */}
                                    {!site.isOwner ? (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Shared with you</span>
                                    ) : !confirming && (
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => startDelete(site.id)}
                                            style={{ padding: '4px 10px', fontSize: '0.8125rem', background: 'transparent', color: 'var(--color-error)', border: '1px solid var(--color-error)' }}
                                        >
                                            <Trash2 size={14} />
                                            Delete
                                        </button>
                                    )}
                                </div>

                                {confirming && (
                                    <form
                                        onSubmit={e => { e.preventDefault(); deleteSite(site); }}
                                        style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, marginTop: 12 }}
                                    >
                                        <label htmlFor={`delete-site-${site.id}`} style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                            Type <strong style={{ color: 'var(--color-text-primary)' }}>{site.domain}</strong> to delete this {kind}
                                        </label>
                                        <input
                                            id={`delete-site-${site.id}`}
                                            className="input"
                                            autoComplete="off"
                                            spellCheck={false}
                                            value={confirmation}
                                            onChange={e => setConfirmation(e.target.value)}
                                            aria-invalid={!!error}
                                            aria-describedby={error ? 'delete-site-error' : undefined}
                                            autoFocus
                                        />
                                        {error && (
                                            <p id="delete-site-error" role="alert" style={{ color: 'var(--color-error)', fontSize: '0.8125rem', margin: 0 }}>{error}</p>
                                        )}
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <button
                                                type="submit"
                                                className="btn"
                                                disabled={deleting || confirmation.trim() !== site.domain}
                                                style={{ background: 'var(--color-error)', color: '#fff', border: '1px solid var(--color-error)' }}
                                            >
                                                {deleting ? <Loader size={16} className="spin" /> : <Trash2 size={16} />}
                                                {deleting ? 'Deleting…' : `Delete ${kind}`}
                                            </button>
                                            <button type="button" className="btn btn-ghost" onClick={() => setConfirmingId(null)} disabled={deleting}>
                                                Cancel
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
