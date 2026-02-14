import cron from 'node-cron';
import { query } from '../db';
import { sendEmail } from '../services/emailService';
import { logger } from '../middleware/logger';

// Check traffic every hour
export const startTrafficAlertJob = () => {
    logger.info('[Job] Starting Traffic Alert job (runs hourly)');

    // Run every hour at minute 0
    cron.schedule('0 * * * *', async () => {
        logger.info('[Job] Running Traffic Alert check...');
        try {
            await checkTrafficSpikes();
        } catch (error) {
            logger.error('[Job] Traffic Alert failed', error);
        }
    });
};

async function checkTrafficSpikes() {
    // Get usage for last hour vs previous hour per domain
    // We join with domains/users to get email
    const queryText = `
        WITH current_hour AS (
            SELECT domain_id, COUNT(*) as count
            FROM sessions
            WHERE started_at >= NOW() - INTERVAL '1 hour'
            GROUP BY domain_id
        ),
        previous_hour AS (
            SELECT domain_id, COUNT(*) as count
            FROM sessions
            WHERE started_at >= NOW() - INTERVAL '2 hours'
              AND started_at < NOW() - INTERVAL '1 hour'
            GROUP BY domain_id
        )
        SELECT 
            d.domain, 
            u.email,
            COALESCE(curr.count, 0) as current_count,
            COALESCE(prev.count, 0) as previous_count
        FROM domains d
        JOIN users u ON d.user_id = u.id
        LEFT JOIN current_hour curr ON d.id = curr.domain_id
        LEFT JOIN previous_hour prev ON d.id = prev.domain_id
        WHERE COALESCE(curr.count, 0) > 10 OR COALESCE(prev.count, 0) > 10 -- Only check if significant traffic
    `;

    const results = await query(queryText);

    for (const row of results) {
        const { domain, email, current_count, previous_count } = row;
        const current = parseInt(current_count);
        const previous = parseInt(previous_count);

        if (previous === 0) {
            if (current > 50) {
                await sendAlert(email, domain, 'Traffic Spike', `Traffic went from 0 to ${current} sessions in the last hour.`);
            }
            continue;
        }

        const change = (current - previous) / previous;

        if (change > 0.5) { // 50% increase
            await sendAlert(email, domain, 'Traffic Spike', `Traffic up ${Math.round(change * 100)}% (${previous} -> ${current})`);
        } else if (change < -0.5) { // 50% drop
            await sendAlert(email, domain, 'Traffic Drop', `Traffic down ${Math.round(Math.abs(change) * 100)}% (${previous} -> ${current})`);
        }
    }
}

async function sendAlert(to: string, domain: string, type: string, message: string) {
    await sendEmail({
        to,
        subject: `[TrackFlow] ${type} Alert for ${domain}`,
        text: `Hello,\n\nWe detected a significant traffic change for ${domain}.\n\n${message}\n\nCheck your dashboard for details.`
    });
}
