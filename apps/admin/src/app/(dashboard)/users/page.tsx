'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Search, ChevronLeft, ChevronRight, Edit, Trash2, Ban, KeyRound, LogIn, Download, Mail } from 'lucide-react';

interface User {
    id: string;
    name: string;
    email: string;
    subscription: string;
    role: string;
    domains_count: string;
    total_events: string;
    created_at: string;
    date_of_birth: string | null;
    age: number | null;
    country: string | null;
    phone: string | null;
    profile_complete: boolean;
    missing_fields: string[];
    restricted_reason: string | null;
}

const FIELD_LABELS: Record<string, string> = {
    name: 'name', date_of_birth: 'date of birth', country: 'country', phone: 'phone',
};

/** Age and profile state, for the list. */
function ProfileCell({ user }: { user: User }) {
    if (user.restricted_reason) {
        return <span className="badge badge-canceled" title="Under 18: dashboard locked, collection stopped, deleted after 30 days">Restricted (under 18)</span>;
    }
    if (!user.profile_complete) {
        return (
            <span className="badge badge-grace" title={`Missing: ${user.missing_fields.map(f => FIELD_LABELS[f] ?? f).join(', ')}`}>
                Incomplete
            </span>
        );
    }
    return <span>{user.age} · {user.country}</span>;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [plan, setPlan] = useState('');
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [editUser, setEditUser] = useState<User | null>(null);
    const [editForm, setEditForm] = useState({ name: '', email: '', subscription: '', role: '' });
    const [emailUser, setEmailUser] = useState<User | null>(null);
    const [emailForm, setEmailForm] = useState({ subject: '', message: '' });
    const [emailSending, setEmailSending] = useState(false);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [dateOfBirth, setDateOfBirth] = useState('');
    const limit = 25;

    const loadUsers = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (search) params.set('search', search);
            if (plan) params.set('plan', plan);
            const data = await api.get(`/api/admin/users?${params}`);
            setUsers(data.users);
            setTotal(data.total);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadUsers(); }, [offset, plan]);

    // Detect super_admin role so we can show the impersonate button
    useEffect(() => {
        api.get('/api/admin/users?limit=1').then(() => {
            // If request succeeds, check role from jwt payload
            const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
            if (token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    setIsSuperAdmin(payload.role === 'super_admin' || payload.adminRole === 'super_admin');
                } catch { /* ignore */ }
            }
        });
    }, []);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setOffset(0);
        loadUsers();
    };

    const handleEdit = (user: User) => {
        setEditUser(user);
        setEditForm({ name: user.name, email: user.email, subscription: user.subscription, role: user.role || 'user' });
        setDateOfBirth(user.date_of_birth || '');
    };

    /** Support's correction: 18+ lifts an under-18 restriction, under 18 applies one. */
    const handleSaveDateOfBirth = async () => {
        if (!editUser || !dateOfBirth) return;
        try {
            const result = await api.put(`/api/admin/users/${editUser.id}/date-of-birth`, { date_of_birth: dateOfBirth });
            alert(result.restricted
                ? 'Saved. This person is under 18, so the account is now restricted.'
                : 'Saved. The account is not restricted.');
            setEditUser(null);
            loadUsers();
        } catch (err: any) { alert(err.message); }
    };

    const handleSave = async () => {
        if (!editUser) return;
        
        const changes: Record<string, string> = {};
        if (editForm.name !== editUser.name) changes.name = editForm.name;
        if (editForm.email !== editUser.email) changes.email = editForm.email;
        if (editForm.subscription !== editUser.subscription) changes.subscription = editForm.subscription;
        if (editForm.role !== (editUser.role || 'user')) changes.role = editForm.role;

        if (Object.keys(changes).length === 0) {
            setEditUser(null);
            return;
        }

        try {
            await api.patch(`/api/admin/users/${editUser.id}`, changes);
            setEditUser(null);
            loadUsers();
        } catch (err: any) {
            alert(err.message);
        }
    };

    // Suspension blocks every sign-in (password, refresh, OAuth); a session that is
    // already open ends when its 15-minute access token expires. Admins must be
    // demoted first, so the button is only offered for user and suspended accounts.
    const handleToggleSuspend = async (user: User) => {
        const suspending = user.role !== 'suspended';
        const prompt = suspending
            ? `Suspend ${user.email}? They will be signed out within 15 minutes and cannot sign in until reactivated. They will be emailed.`
            : `Reactivate ${user.email}? They will be able to sign in again and will be emailed.`;
        if (!confirm(prompt)) return;
        try {
            await api.post(`/api/admin/users/${user.id}/suspend`, {});
            loadUsers();
        } catch (err: any) { alert(err.message); }
    };

    const handleDelete = async (user: User) => {
        if (!confirm(`Delete user ${user.email} and all their data? This is irreversible.`)) return;
        try {
            await api.delete(`/api/admin/users/${user.id}`);
            loadUsers();
        } catch (err: any) { alert(err.message); }
    };

    const handleSendEmail = async () => {
        if (!emailUser || !emailForm.subject.trim() || !emailForm.message.trim()) return;
        setEmailSending(true);
        try {
            await api.post(`/api/admin/users/${emailUser.id}/email`, emailForm);
            setEmailUser(null);
            setEmailForm({ subject: '', message: '' });
            alert('Email sent successfully');
        } catch (err: any) {
            alert('Failed to send email: ' + err.message);
        } finally {
            setEmailSending(false);
        }
    };

    const handleExport = async (user: User) => {
        try {
            // Note: api.post returns parsed JSON data natively based on our api hook implementation
            const data = await api.post(`/api/admin/export/user/${user.id}`, {});
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `export_user_${user.id}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            alert('Export failed: ' + err.message);
        }
    };

    const handleResetPassword = async (user: User) => {
        const newPassword = prompt(`Enter new password for ${user.email} (min 8 chars):`);
        if (!newPassword) return;
        try {
            await api.post(`/api/admin/users/${user.id}/reset-password`, { newPassword });
            alert('Password reset successfully');
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleImpersonate = async (user: User) => {
        // Checked BEFORE the token is minted: a deployment missing this variable
        // used to open http://localhost:3000 and waste the impersonation token.
        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        if (!appUrl) {
            alert(
                'NEXT_PUBLIC_APP_URL is not set, so the impersonation session cannot be opened. ' +
                'Set it to the public URL of the Thravic web app and redeploy.'
            );
            return;
        }

        try {
            const data = await api.post(`/api/admin/users/${user.id}/impersonate`, {});
            const url = `${appUrl}/dashboard?impersonate_token=${data.token}&impersonate_email=${encodeURIComponent(user.email)}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err: any) {
            alert(err.message || 'Failed to start impersonation session');
        }
    };

    return (
        <div>
            {/* Search and filters */}
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', alignItems: 'center' }}>
                <form onSubmit={handleSearch} className="search-bar" style={{ flex: 1 }}>
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search users by name or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </form>
                <select
                    className="input"
                    style={{ width: '160px' }}
                    value={plan}
                    onChange={(e) => { setPlan(e.target.value); setOffset(0); }}
                >
                    <option value="">All Plans</option>
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="agency">Agency</option>
                </select>
            </div>

            {/* Users table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Plan</th>
                            <th>Role</th>
                            <th>Age · Country</th>
                            <th>Domains</th>
                            <th>Events</th>
                            <th>Joined</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} className="loading"><div className="spinner" /></td></tr>
                        ) : users.length === 0 ? (
                            <tr><td colSpan={9} className="empty-state">No users found</td></tr>
                        ) : (
                            users.map((user) => (
                                <tr key={user.id}>
                                    <td style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{user.name}</td>
                                    <td>{user.email}</td>
                                    <td><span className={`badge badge-${user.subscription}`}>{user.subscription}</span></td>
                                    <td><span className={`badge badge-${user.role || 'user'}`}>{user.role || 'user'}</span></td>
                                    <td><ProfileCell user={user} /></td>
                                    <td>{user.domains_count}</td>
                                    <td>{parseInt(user.total_events).toLocaleString()}</td>
                                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(user)} title="Edit">
                                                <Edit size={14} />
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleResetPassword(user)} title="Reset Password">
                                                <KeyRound size={14} />
                                            </button>
                                            {isSuperAdmin && (
                                                <button className="btn btn-ghost btn-sm" onClick={() => handleImpersonate(user)} title="Login as this user">
                                                    <LogIn size={14} />
                                                </button>
                                            )}
                                            <button className="btn btn-primary btn-sm" onClick={() => { setEmailUser(user); setEmailForm({ subject: '', message: '' }); }} title="Email User">
                                                <Mail size={14} />
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleExport(user)} title="Export GDPR Data">
                                                <Download size={14} />
                                            </button>
                                            {(user.role || 'user') === 'user' || user.role === 'suspended' ? (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleToggleSuspend(user)}
                                                    title={user.role === 'suspended' ? 'Reactivate' : 'Suspend'}
                                                    aria-label={`${user.role === 'suspended' ? 'Reactivate' : 'Suspend'} ${user.email}`}
                                                    style={user.role === 'suspended' ? { color: 'var(--color-success)' } : undefined}
                                                >
                                                    <Ban size={14} />
                                                </button>
                                            ) : null}
                                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(user)} title="Delete">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
                <div className="pagination" style={{ padding: 'var(--space-md) var(--space-lg)' }}>
                    <span>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button className="btn btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - limit))}>
                            <ChevronLeft size={14} /> Prev
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={offset + limit >= total} onClick={() => setOffset(o => o + limit)}>
                            Next <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Edit modal */}
            {editUser && (
                <div className="modal-overlay" onClick={() => setEditUser(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3 className="modal-title">Edit User: {editUser.name}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Name</label>
                                <input className="input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Email</label>
                                <input className="input" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Plan</label>
                                <select className="input" value={editForm.subscription} onChange={e => setEditForm(f => ({ ...f, subscription: e.target.value }))}>
                                    <option value="free">Free</option>
                                    <option value="pro">Pro</option>
                                    <option value="agency">Agency</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Role</label>
                                <select className="input" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                    <option value="super_admin">Super Admin</option>
                                </select>
                            </div>
                            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-md)' }}>
                                <label htmlFor="admin-dob" style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Date of birth</label>
                                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                                    <input id="admin-dob" className="input" type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} />
                                    <button className="btn btn-ghost btn-sm" onClick={handleSaveDateOfBirth} disabled={!dateOfBirth || dateOfBirth === (editUser.date_of_birth || '')}>Correct</button>
                                </div>
                                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                    Users set this once. Correct it only on request with proof; 18 or older lifts an under-18 restriction.
                                    {editUser.phone && <> Phone: {editUser.phone}.</>}
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-md)' }}>
                                <button className="btn btn-ghost" onClick={() => setEditUser(null)}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Email modal */}
            {emailUser && (
                <div className="modal-overlay" onClick={() => !emailSending && setEmailUser(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3 className="modal-title">Email User: {emailUser.email}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Subject</label>
                                <input className="input" placeholder="e.g. Action Required on your Account" value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))} disabled={emailSending} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Message body</label>
                                <textarea className="input" rows={6} placeholder="Type your message here..." value={emailForm.message} onChange={e => setEmailForm(f => ({ ...f, message: e.target.value }))} style={{ resize: 'vertical', fontFamily: 'inherit' }} disabled={emailSending} />
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-md)' }}>
                                <button className="btn btn-ghost" onClick={() => setEmailUser(null)} disabled={emailSending}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleSendEmail} disabled={emailSending}>
                                    {emailSending ? 'Sending...' : 'Send Email'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
