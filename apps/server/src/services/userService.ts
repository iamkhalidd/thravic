// ──────────────────────────────────────────────
// Thravic — User Service
// ──────────────────────────────────────────────
import { query, queryOne } from '../db';

export interface UserRow {
    id: string;
    email: string;
    password: string;
    name: string;
    subscription: string;
    paystack_customer_code: string | null;
    paystack_subscription_code: string | null;
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
    const user = rows[0] ?? null;

    // Auto-create a free subscription row so billing/admin pages show the user
    if (user) {
        await query(
            `INSERT INTO subscriptions (user_id, plan, status, events_limit, domains_limit)
             VALUES ($1, 'free', 'active', 10000, 1)
             ON CONFLICT (user_id) DO NOTHING`,
            [user.id]
        ).catch(() => { /* non-fatal — subscription can be created later */ });
    }

    return user;
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

