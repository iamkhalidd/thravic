import { logger } from '../middleware/logger';

let geoip: any;

try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    geoip = require('geoip-lite');
} catch (e) {
    logger.warn('[Geo] geoip-lite not found. Geo tracking will be disabled.');
}

export interface GeoLocation {
    country?: string;
    region?: string;
    city?: string;
}

export const checkIp = (ip: string): GeoLocation | null => {
    if (!geoip || !ip) return null;

    try {
        // Handle localhost/private IPs
        if (ip === '127.0.0.1' || ip === '::1') {
            return { country: 'LO', city: 'Localhost' };
        }

        const geo = geoip.lookup(ip);
        if (geo) {
            return {
                country: geo.country,
                region: geo.region,
                city: geo.city
            };
        }
    } catch (error) {
        logger.error('[Geo] Lookup failed', error);
    }
    return null;
};
