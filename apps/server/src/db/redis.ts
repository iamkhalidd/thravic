import Redis from 'ioredis';
import dotenv from 'dotenv';
import { createLogger } from '../config/logger';

dotenv.config();

const log = createLogger('Redis');

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
    log.error('REDIS_URL environment variable is missing. Redis caching and queueing will fail.');
}

// Create a singleton Redis client
export const redis = new Redis(REDIS_URL || '', {
    retryStrategy: (times) => {
        // Reconnect after
        return Math.min(times * 50, 2000);
    },
    maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
    log.info('Connected to Upstash Redis');
});

redis.on('error', (err) => {
    log.error('Redis connection error', err);
});

export default redis;
