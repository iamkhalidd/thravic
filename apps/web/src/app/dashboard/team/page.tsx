'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDomain } from '@/contexts/DomainContext';
import { useSubscription } from '@/hooks/useSubscription';
import { UpgradeGate } from '@/components/UpgradeGate';
import { Trash2, Shield, Eye, Mail, Crown } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ChartCard } from '@/components/ChartCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function teamApi<T>(path: string, options?: RequestInit): Promise<{ data?: T; error?: string }> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    try {
        const res = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...options?.headers,
            },
        });
        const json = await res.json();
        if (!res.ok) return { error: json.error || 'Request failed' };
        return { data: json };
    } catch (err: any) {
        return { error: 'Service temporarily unavailable. Please try again.' };
    }
}

interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: 'owner' | 'admin' | 'viewer';
    created_at: string;
}

export default function TeamPage() {
    const { selectedDomainId, selectedDomain } = useDomain();
    const { hasFeature, plan, loading: subLoading } = useSubscription();

    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'viewer' | 'admin'>('viewer');
    const [inviting, setInviting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadMembers = useCallback(async () => {
        if (!selectedDomainId) return;
        setLoading(true);
        try {
            const result = await teamApi<TeamMember[]>(`/api/teams/${selectedDomainId}/members`);
            setMembers(result.data || []);
            setLoadError(result.error ?? null);
        } catch {
            setMembers([]);
        } finally {
            setLoading(false);
        }
    }, [selectedDomainId]);

    useEffect(() => {
        if (hasFeature('team', selectedDomain?.features || undefined) && selectedDomainId) {
            loadMembers();
        } else {
            setLoading(false);
        }
    }, [selectedDomainId, selectedDomain?.features, hasFeature, loadMembers]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail.trim() || !selectedDomainId) return;

        setInviting(true);
        setMessage(null);
        try {
            const result = await teamApi<{ message: string; error?: string }>(
                `/api/teams/${selectedDomainId}/invite`,
                { method: 'POST', body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }) }
            );
            if (result.error) {
                setMessage({ type: 'error', text: result.error });
            } else {
                setMessage({ type: 'success', text: result.data?.message || 'Member added!' });
                setInviteEmail('');
                loadMembers();
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: 'Failed to invite member. Please ensure the email is correct and try again.' });
        } finally {
            setInviting(false);
        }
    };

    const handleRemove = async (memberId: string) => {
        if (!selectedDomainId || !confirm('Remove this member from your domain?')) return;
        setRemovingId(memberId);
        try {
            const result = await teamApi(`/api/teams/${selectedDomainId}/members/${memberId}`, { method: 'DELETE' });
            if (result.error) {
                setMessage({ type: 'error', text: result.error });
                return;
            }
            setMembers(prev => prev.filter(m => m.id !== memberId));
            setMessage({ type: 'success', text: 'Member removed' });
        } catch (err: any) {
            setMessage({ type: 'error', text: 'Failed to remove member. Please try again.' });
        } finally {
            setRemovingId(null);
        }
    };

    // Gate: team feature requires Pro+
    if (!subLoading && !hasFeature('team', selectedDomain?.features || undefined)) {
        return (
            <div className="page-stack">
                <PageHeader title="Team" subtitle="Collaborate with your team on analytics." />
                <UpgradeGate feature="team" requiredPlan="pro"
                    message="Invite team members to view and manage your analytics. Upgrade to Pro to unlock team collaboration." />
            </div>
        );
    }

    return (
        <div className="page-stack">
            <PageHeader
                title="Team"
                subtitle={<>Manage who has access to <strong style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{selectedDomain?.domain || 'your site'}</strong>.</>}
            />

            {/* Invite form */}
            <ChartCard
                title="Invite a team member"
                subtitle="Viewers can see analytics and reports. Admins can also manage settings, team and webhooks."
            >
                <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                        <label htmlFor="invite-email" style={labelStyle}>Email address</label>
                        <input
                            id="invite-email"
                            className="input"
                            type="email"
                            placeholder="colleague@company.com"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div style={{ flex: '0 1 140px' }}>
                        <label htmlFor="invite-role" style={labelStyle}>Role</label>
                        <select id="invite-role" className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as 'viewer' | 'admin')}>
                            <option value="viewer">Viewer</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={inviting || !inviteEmail.trim()}
                    >
                        <Mail size={16} />
                        {inviting ? 'Inviting…' : 'Invite'}
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
            </ChartCard>

            {/* Members list */}
            <ChartCard flush title="Members" subtitle={loading ? undefined : `${members.length} ${members.length === 1 ? 'person' : 'people'}`}>
                {loading ? (
                    <div className="skeleton" style={{ height: 120, margin: '0 20px 20px' }} />
                ) : loadError ? (
                    <div role="alert" className="empty-note" style={{ color: 'var(--color-error)' }}>
                        Could not load members: {loadError}
                    </div>
                ) : members.length === 0 ? (
                    <div className="empty-note">No team members yet. Invite a colleague above.</div>
                ) : (
                    <div style={{ overflowX: 'auto', marginTop: 6 }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: 20 }}>Member</th>
                                    <th>Role</th>
                                    <th className="num">Added</th>
                                    <th aria-label="Actions" style={{ width: 52, paddingRight: 20 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {members.map(member => {
                                    const RoleIcon = member.role === 'owner' ? Crown : member.role === 'admin' ? Shield : Eye;
                                    return (
                                        <tr key={member.id}>
                                            <td style={{ paddingLeft: 20 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                                    <span aria-hidden="true" style={{
                                                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                                        background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: 600, fontSize: '0.75rem', color: 'var(--color-text-secondary)',
                                                    }}>
                                                        {member.name?.charAt(0)?.toUpperCase() || member.email.charAt(0).toUpperCase()}
                                                    </span>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 500 }}>{member.name || 'Unnamed'}</div>
                                                        <div className="muted" style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {member.email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge" style={{ gap: 4 }}>
                                                    <RoleIcon size={12} aria-hidden="true" />
                                                    {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                                                </span>
                                            </td>
                                            <td className="num muted">{new Date(member.created_at).toLocaleDateString()}</td>
                                            <td style={{ paddingRight: 20, textAlign: 'right' }}>
                                                {member.role !== 'owner' && (
                                                    <button
                                                        className="btn btn-ghost"
                                                        onClick={() => handleRemove(member.id)}
                                                        disabled={removingId === member.id}
                                                        title="Remove member"
                                                        aria-label={`Remove ${member.name || member.email}`}
                                                        style={{ padding: 6, color: 'var(--color-text-secondary)' }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
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
