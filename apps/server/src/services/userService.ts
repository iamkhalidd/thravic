// ──────────────────────────────────────────────
// Thravic — User Service
// ──────────────────────────────────────────────
import { query, queryOne } from '../db';

export interface UserRow {
    id: string;
    email: string;
    password: string | null;
    name: string;
    subscription: string;
    paystack_customer_code: string | null;
    paystack_subscription_code: string | null;
    preferences: Record<string, any>;
    // OAuth
    auth_provider: string;
    auth_provider_id: string | null;
    // Profile
    avatar_url: string | null;
    company: string | null;
    job_title: string | null;
    website: string | null;
    phone: string | null;
    country: string | null;
    timezone: string | null;
    created_at: Date;
    updated_at: Date;
}

// ── Create user (email+password) ────────────────────────────────────────────
export async function createUser(
    email: string,
    password: string,
    name: string
): Promise<UserRow> {
    const rows = await query<UserRow>(
        `INSERT INTO users (email, password, name, preferences)
         VALUES ($1, $2, $3, '{}')
         RETURNING *`,
        [email, password, name]
    );
    const user = rows[0] ?? null;

    // Auto-create a free subscription row so billing/admin pages show the user
    if (user) {
        await query(
            `INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit)
             VALUES ($1, 'free', 'active', 10000, 1)
             ON CONFLICT (user_id) DO NOTHING`,
            [user.id]
        ).catch(() => { /* non-fatal */ });
    }

    return user;
}

// ── Create OAuth user (no password) ─────────────────────────────────────────
export async function createOAuthUser(
    email: string,
    name: string,
    provider: string,
    providerId: string,
    avatarUrl?: string
): Promise<UserRow> {
    const rows = await query<UserRow>(
        `INSERT INTO users (email, name, auth_provider, auth_provider_id, avatar_url, preferences)
         VALUES ($1, $2, $3, $4, $5, '{}')
         RETURNING *`,
        [email, name, provider, providerId, avatarUrl || null]
    );
    const user = rows[0] ?? null;

    if (user) {
        await query(
            `INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit)
             VALUES ($1, 'free', 'active', 10000, 1)
             ON CONFLICT (user_id) DO NOTHING`,
            [user.id]
        ).catch(() => { /* non-fatal */ });
    }

    return user;
}

// ── Find by OAuth provider ID ───────────────────────────────────────────────
export async function findByOAuthId(
    provider: string,
    providerId: string
): Promise<UserRow | null> {
    return queryOne<UserRow>(
        `SELECT * FROM users WHERE auth_provider = $1 AND auth_provider_id = $2`,
        [provider, providerId]
    );
}

// ── Link OAuth to existing user ─────────────────────────────────────────────
export async function linkOAuth(
    userId: string,
    provider: string,
    providerId: string,
    avatarUrl?: string
): Promise<UserRow | null> {
    return queryOne<UserRow>(
        `UPDATE users
         SET auth_provider = $2,
             auth_provider_id = $3,
             avatar_url = COALESCE(avatar_url, $4),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [userId, provider, providerId, avatarUrl || null]
    );
}

// ── Update password ─────────────────────────────────────────────────────────
export async function updatePassword(
    userId: string,
    hashedPassword: string
): Promise<void> {
    await query(
        `UPDATE users SET password = $2, updated_at = NOW() WHERE id = $1`,
        [userId, hashedPassword]
    );
}

// ── Find by email ───────────────────────────────────────────────────────────
export async function findByEmail(email: string): Promise<UserRow | null> {
    return queryOne<UserRow>(
        `SELECT * FROM users WHERE email = $1`,
        [email]
    );
}

// ── Find by ID ──────────────────────────────────────────────────────────────
export async function findById(id: string): Promise<UserRow | null> {
    return queryOne<UserRow>(
        `SELECT * FROM users WHERE id = $1`,
        [id]
    );
}

// ── Update subscription ─────────────────────────────────────────────────────
export async function updateSubscription(
    userId: string,
    subscription: string,
    paystackCustomerCode?: string,
    paystackSubscriptionCode?: string
): Promise<UserRow | null> {
    return queryOne<UserRow>(
        `UPDATE users
         SET subscription = $2,
             paystack_customer_code = COALESCE($3, paystack_customer_code),
             paystack_subscription_code = COALESCE($4, paystack_subscription_code),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [userId, subscription, paystackCustomerCode || null, paystackSubscriptionCode || null]
    );
}

// ── Update preferences ──────────────────────────────────────────────────────
export async function updatePreferences(
    userId: string,
    preferences: Record<string, any>
): Promise<UserRow | null> {
    return queryOne<UserRow>(
        `UPDATE users
         SET preferences = $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [userId, JSON.stringify(preferences)]
    );
}

// ── Update profile fields ───────────────────────────────────────────────────
export async function updateProfile(
    userId: string,
    fields: {
        name?: string;
        company?: string;
        job_title?: string;
        website?: string;
        phone?: string;
        country?: string;
        timezone?: string;
    }
): Promise<UserRow | null> {
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (fields.name !== undefined) { sets.push(`name = $${idx++}`); values.push(fields.name); }
    if (fields.company !== undefined) { sets.push(`company = $${idx++}`); values.push(fields.company); }
    if (fields.job_title !== undefined) { sets.push(`job_title = $${idx++}`); values.push(fields.job_title); }
    if (fields.website !== undefined) { sets.push(`website = $${idx++}`); values.push(fields.website); }
    if (fields.phone !== undefined) { sets.push(`phone = $${idx++}`); values.push(fields.phone); }
    if (fields.country !== undefined) { sets.push(`country = $${idx++}`); values.push(fields.country); }
    if (fields.timezone !== undefined) { sets.push(`timezone = $${idx++}`); values.push(fields.timezone); }

    if (sets.length === 0) return findById(userId);

    sets.push(`updated_at = NOW()`);
    values.push(userId);

    return queryOne<UserRow>(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
    );
}

// ── Update avatar ───────────────────────────────────────────────────────────
export async function updateAvatar(
    userId: string,
    avatarUrl: string | null
): Promise<UserRow | null> {
    return queryOne<UserRow>(
        `UPDATE users SET avatar_url = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [userId, avatarUrl]
    );
}
