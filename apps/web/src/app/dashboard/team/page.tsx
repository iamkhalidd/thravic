'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDomain } from '@/contexts/DomainContext';
import { useSubscription } from '@/hooks/useSubscription';
import { UpgradeGate } from '@/components/UpgradeGate';
import { apiRequest } from '@/lib/api';
import { Users, UserPlus, Trash2, Shield, Eye, Mail, Crown } from 'lucide-react';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'viewer';
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

    const loadMembers = useCallback(async () => {
        if (!selectedDomainId) return;
        setLoading(true);
        try {
            const result = await apiRequest<TeamMember[]>(`/api/teams/${selectedDomainId}/members`);
            setMembers(result.data || []);
        } catch {
            setMembers([]);
        } finally {
            setLoading(false);
        }
    }, [selectedDomainId]);

    useEffect(() => {
        if (hasFeature('team') && selectedDomainId) {
            loadMembers();
        } else {
            setLoading(false);
        }
    }, [selectedDomainId, hasFeature, loadMembers]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail.trim() || !selectedDomainId) return;

        setInviting(true);
        setMessage(null);
        try {
            const result = await apiRequest<{ message: string; error?: string }>(
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
            setMessage({ type: 'error', text: err?.message || 'Failed to invite member' });
        } finally {
            setInviting(false);
        }
    };

    const handleRemove = async (memberId: string) => {
        if (!selectedDomainId || !confirm('Remove this member from your domain?')) return;
        setRemovingId(memberId);
        try {
            await apiRequest(`/api/teams/${selectedDomainId}/members/${memberId}`, { method: 'DELETE' });
            setMembers(prev => prev.filter(m => m.id !== memberId));
            setMessage({ type: 'success', text: 'Member removed' });
        } catch (err: any) {
            setMessage({ type: 'error', text: err?.message || 'Failed to remove member' });
        } finally {
            setRemovingId(null);
        }
    };

    // Gate: team feature requires Pro+
    if (!subLoading && !hasFeature('team')) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <div>
                        <h2 className="page-title">Team</h2>
                        <p className="page-subtitle">Collaborate with your team on analytics</p>
                    </div>
                </div>
                <UpgradeGate feature="team" requiredPlan="pro"
                    message="Invite team members to view and manage your analytics. Upgrade to Pro to unlock team collaboration." />
            </div>
        );
    }

    return (
        <div className="page-container">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={24} /> Team
                    </h2>
                    <p className="page-subtitle">
                        Manage who has access to <strong>{selectedDomain?.domain || 'your domain'}</strong>
                    </p>
                </div>
            </div>

            {/* Invite form */}
            <div className="card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <UserPlus size={18} /> Invite a Team Member
                </h3>
                <form onSubmit={handleInvite} style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 250px' }}>
                        <label style={labelStyle}>Email Address</label>
                        <input
                            className="input"
                            type="email"
                            placeholder="colleague@company.com"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div style={{ flex: '0 0 140px' }}>
                        <label style={labelStyle}>Role</label>
                        <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as 'viewer' | 'admin')}>
                            <option value="viewer">Viewer</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={inviting || !inviteEmail.trim()}
                        style={{ height: '42px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Mail size={16} />
                        {inviting ? 'Inviting...' : 'Invite'}
                    </button>
                </form>

                {message && (
                    <div style={{
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
                    <strong>Viewer</strong> — Can view analytics and reports &nbsp;&nbsp;|&nbsp;&nbsp;
                    <strong>Admin</strong> — Can also manage settings, team, and webhooks
                </p>
            </div>

            {/* Members list */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Users size={18} /> Members ({members.length})
                    </h3>
                </div>

                {loading ? (
                    <div className="loading" style={{ padding: '3rem' }}><div className="spinner" /></div>
                ) : members.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <Users size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                        <p>No team members yet.</p>
                        <p style={{ fontSize: '0.85rem' }}>Invite colleagues to collaborate on analytics for this domain.</p>
                    </div>
                ) : (
                    <div>
                        {members.map(member => (
                            <div
                                key={member.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                                    padding: 'var(--space-md) var(--space-lg)',
                                    borderBottom: '1px solid var(--color-border)',
                                }}
                            >
                                {/* Avatar */}
                                <div style={{
                                    width: 40, height: 40, borderRadius: '50%',
                                    background: 'var(--color-bg-tertiary)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 600, fontSize: '1rem', color: 'var(--color-accent)',
                                    flexShrink: 0,
                                }}>
                                    {member.name?.charAt(0)?.toUpperCase() || member.email.charAt(0).toUpperCase()}
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {member.name || 'Unnamed'}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {member.email}
                                    </div>
                                </div>

                                {/* Role badge */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    padding: '4px 10px', borderRadius: '12px',
                                    fontSize: '0.8rem', fontWeight: 600,
                                    background: member.role === 'admin' ? 'rgba(109,92,255,0.15)' : 'rgba(255,255,255,0.05)',
                                    color: member.role === 'admin' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                                }}>
                                    {member.role === 'admin' ? <Shield size={12} /> : <Eye size={12} />}
                                    {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                                </div>

                                {/* Joined date */}
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                                    {new Date(member.created_at).toLocaleDateString()}
                                </div>

                                {/* Remove button */}
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => handleRemove(member.id)}
                                    disabled={removingId === member.id}
                                    title="Remove member"
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
