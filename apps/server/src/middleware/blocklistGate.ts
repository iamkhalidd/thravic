import { Request, Response, NextFunction } from 'express';
import { isEnabled, getSetting } from '../services/settingsService';
import { createLogger } from '../config/logger';

const log = createLogger('Middleware:Blocklist');

export const blocklistGate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const clientIp = req.ip || req.headers['x-forwarded-for'] as string || '';
        const referer = req.headers.referer || '';

        // Check IPs
        const blockedIps = await getSetting<{ ips: string[] }>('security.blocked_ips');
        if (blockedIps?.ips && Array.isArray(blockedIps.ips)) {
            if (blockedIps.ips.includes(clientIp)) {
                log.warn(`Blocked IP attempt: ${clientIp}`);
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        // Check Referrers
        const blockedReferrers = await getSetting<{ referrers: string[] }>('security.blocked_referrers');
        if (blockedReferrers?.referrers && Array.isArray(blockedReferrers.referrers) && referer) {
            try {
                const url = new URL(referer);
                const host = url.hostname;
                if (blockedReferrers.referrers.some(r => host.includes(r))) {
                    log.warn(`Blocked Referrer attempt: ${referer}`);
                    return res.status(403).json({ error: 'Access denied' });
                }
            } catch {
                // Ignore invalid referer parsing
            }
        }

        next();
    } catch (err) {
        log.error('Blocklist gate error', err);
        // Fail open if settings service is down
        next();
    }
};
