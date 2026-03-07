// Thravic Analytics - Database Connection
// Following MVP Spec: Infrastructure & Performance

import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20, // Maximum connections in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
    console.log('[DB] New client connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected error on idle client:', err);
});

// Query helper with logging
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DB] Query executed in ${duration}ms:`, text.substring(0, 100));
        }
        return result.rows as T[];
    } catch (error) {
        console.error('[DB] Query error:', error);
        throw error;
    }
}

// Single result helper
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows.length > 0 ? rows[0] : null;
}

// Transaction helper
export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// Initialize database (run migrations)
export async function initDatabase(): Promise<void> {
    console.log('[DB] Initializing database...');

    try {
        // Check connection
        await pool.query('SELECT NOW()');
        console.log('[DB] Connection successful');

        // Run schema (in production, use proper migrations)
        const fs = await import('fs');
        const path = await import('path');
        const schemaPath = path.join(__dirname, 'schema.sql');

        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf-8');
            await pool.query(schema);
            console.log('[DB] Schema applied successfully');
        }
    } catch (error) {
        console.error('[DB] Initialization failed:', error);
        throw error;
    }
}

// Close pool (for graceful shutdown)
export async function closeDatabase(): Promise<void> {
    await pool.end();
    console.log('[DB] Connection pool closed');
}

// Export pool for direct access if needed
export { pool };

export default {
    query,
    queryOne,
    transaction,
    initDatabase,
    closeDatabase,
    pool
};
