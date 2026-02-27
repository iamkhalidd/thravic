// ──────────────────────────────────────────────
// TrackFlow — User Service
// ──────────────────────────────────────────────
import { query, queryOne } from '../db';

export interface UserRow {
    id: string;
    email: string;
    password: string;
    name: string;
    subscription: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    preferences: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

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
    return rows[0] ?? null;
}

export async function updatePassword(
    userId: string,
    hashedPassword: string
): Promise<void> {
    await query(
        `UPDATE users SET password = $2, updated_at = NOW() WHERE id = $1`,
        [userId, hashedPassword]
    );
}
export async function findByEmail(email: string): Promise<UserRow | null> {
    return queryOne<UserRow>(
        `SELECT * FROM users WHERE email = $1`,
        [email]
    );
}

export async function findById(id: string): Promise<UserRow | null> {
    return queryOne<UserRow>(
        `SELECT * FROM users WHERE id = $1`,
        [id]
    );
}

export async function updateSubscription(
    userId: string,
    subscription: string,
    stripeCustomerId?: string,
    stripeSubscriptionId?: string
): Promise<UserRow | null> {
    return queryOne<UserRow>(
        `UPDATE users
         SET subscription = $2,
             stripe_customer_id = COALESCE($3, stripe_customer_id),
             stripe_subscription_id = COALESCE($4, stripe_subscription_id),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [userId, subscription, stripeCustomerId || null, stripeSubscriptionId || null]
    );
}

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

