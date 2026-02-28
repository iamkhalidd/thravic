// Admin System Route — Server health, database stats, errors
import { Router, Response } from 'express';
import { adminAuth } from '../../middleware/adminAuth';
import { AuthRequest } from '../../middleware/auth';
import { query, queryOne, pool } from '../../db';
import { createLogger } from '../../config/logger';

const log = createLogger('Admin:System');
const router = Router();

// GET /api/admin/system/health — server health overview
router.get('/health', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();

        // Real DB connectivity check
        let dbConnected = false;
        try {
            await pool.query('SELECT 1');
            dbConnected = true;
        } catch { dbConnected = false; }

        // DB connection pool stats
        const poolStats = {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount
        };

        // DB size
        const dbSize = await queryOne<{ size: string }>(
            `SELECT pg_size_pretty(pg_database_size(current_database())) as size`
        );

        const restartedAt = new Date(Date.now() - uptime * 1000).toISOString();

        res.json({
            server: {
                uptime: Math.floor(uptime),
                uptimeFormatted: formatUptime(uptime),
                restartedAt,
                nodeVersion: process.version,
                platform: process.platform,
                pid: process.pid,
                env: process.env.NODE_ENV || 'development'
            },
            memory: {
                rss: formatBytes(memoryUsage.rss),
                heapUsed: formatBytes(memoryUsage.heapUsed),
                heapTotal: formatBytes(memoryUsage.heapTotal),
                external: formatBytes(memoryUsage.external)
            },
            database: {
                pool: poolStats,
                size: dbSize?.size || 'unknown',
                connected: dbConnected
            }
        });
    } catch (error) {
        log.error('System health error', error);
        res.status(500).json({ error: 'Failed to get system health' });
    }
});

// GET /api/admin/system/db-stats — detailed database stats
router.get('/db-stats', adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        // Table sizes
        const tableSizes = await query(
            `SELECT 
                relname as table_name,
                n_live_tup as row_count,
                pg_size_pretty(pg_total_relation_size(relid)) as total_size
             FROM pg_stat_user_tables 
             ORDER BY pg_total_relation_size(relid) DESC`
        );

        // Active connections
        const connections = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM pg_stat_activity WHERE state = 'active'`
        );

        // Slow queries (queries taking > 1 second, if pg_stat_statements is available)
        let slowQueries: any[] = [];
        try {
            slowQueries = await query(
                `SELECT query, calls, mean_exec_time, total_exec_time 
                 FROM pg_stat_statements 
                 WHERE mean_exec_time > 1000 
                 ORDER BY mean_exec_time DESC LIMIT 10`
            );
        } catch {
            // pg_stat_statements extension may not be installed
        }

        res.json({
            tables: tableSizes,
            activeConnections: parseInt(connections?.count || '0'),
            slowQueries
        });
    } catch (error) {
        log.error('DB stats error', error);
        res.status(500).json({ error: 'Failed to get database stats' });
    }
});

function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
}

function formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return `${bytes.toFixed(1)} ${units[i]}`;
}

export default router;
