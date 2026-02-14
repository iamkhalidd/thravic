import { startTrafficAlertJob } from './trafficAlert';
import { logger } from '../middleware/logger';

export const initJobs = () => {
    logger.info('[Jobs] Initializing scheduled jobs...');
    startTrafficAlertJob();
    logger.info('[Jobs] All jobs scheduled.');
};
