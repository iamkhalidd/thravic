// Admin Audit Service
// Logs all admin actions for accountability and compliance

import { query, queryOne } from '../db';
import { createLogger } from '../config/logger';

const log = createLogger('Audit');

export interface AuditEntry {
    adminId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
}

// Log an admin action
export async function logAction(entry: AuditEntry): Promise<void> {
    try {
        await query(
            `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                entry.adminId,
                entry.action,
                entry.targetType || null,
                entry.targetId || null,
                entry.details ? JSON.stringify(entry.details) : null,
                entry.ipAddress || null
            ]
        );
    } catch (error) {
        // Don't let audit logging failures break admin operations
        log.error('Failed to log action', error);
    }
}

// Retrieve audit log entries
export async function getAuditLog(options: {
    adminId?: string;
    action?: string;
    targetType?: string;
    limit?: number;
    offset?: number;
}) {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.adminId) {
        conditions.push(`al.admin_id = $${paramIndex++}`);
        params.push(options.adminId);
    }
    if (options.action) {
        conditions.push(`al.action LIKE $${paramIndex++}`);
        params.push(`%${options.action}%`);
    }
    if (options.targetType) {
        conditions.push(`al.target_type = $${paramIndex++}`);
        params.push(options.targetType);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const entries = await query(
        `SELECT al.*, u.name as admin_name, u.email as admin_email
         FROM admin_audit_log al
         LEFT JOIN users u ON al.admin_id = u.id
         ${where}
         ORDER BY al.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
    );

    const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM admin_audit_log al ${where}`,
        params
    );

    return {
        entries,
        total: parseInt(countResult?.count || '0'),
        limit,
        offset
    };
}
