import { logger } from '../middleware/logger';

interface EmailOptions {
    to: string;
    subject: string;
    text: string;
    html?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
    // In production, use Nodemailer or SendGrid here.
    // For now, we log to console to demonstrate functionality.
    logger.info(`[Email Service] Sending email to ${options.to}`);
    logger.info(`[Subject] ${options.subject}`);
    logger.info(`[Body] ${options.text}`);

    // Simulate async network call
    await new Promise(resolve => setTimeout(resolve, 100));
};
