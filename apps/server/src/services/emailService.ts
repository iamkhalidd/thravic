// ──────────────────────────────────────────────
// TrackFlow — Email Service
// ──────────────────────────────────────────────
import nodemailer from 'nodemailer';
import { logger } from '../middleware/logger';

interface EmailOptions {
    to: string;
    subject: string;
    text: string;
    html?: string;
}

// Build SMTP transport if env vars are present, otherwise null (dev fallback).
function createTransport() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        logger.warn('[Email] SMTP not configured — emails will be logged to console');
        return null;
    }

    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 587,
        secure: Number(SMTP_PORT) === 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
        },
    });
}

let transporter: nodemailer.Transporter | null = null;

/** Initialise (or re-initialise) the transporter. */
export function initEmailTransport() {
    transporter = createTransport();
}

// Auto-init on module load
initEmailTransport();

export const sendEmail = async (options: EmailOptions): Promise<void> => {
    const from = process.env.SMTP_FROM || 'TrackFlow <noreply@trackflow.app>';

    // ── Production path: real SMTP ──────────────
    if (transporter) {
        try {
            await transporter.sendMail({
                from,
                to: options.to,
                subject: options.subject,
                text: options.text,
                html: options.html,
            });
            logger.info(`[Email] Sent "${options.subject}" to ${options.to}`);
        } catch (err) {
            logger.error(`[Email] Failed to send to ${options.to}: ${(err as Error).message}`);
            throw err;
        }
        return;
    }

    // ── Development fallback: log to console ────
    logger.info(`[Email] (dev) To: ${options.to}`);
    logger.info(`[Email] (dev) Subject: ${options.subject}`);
    logger.info(`[Email] (dev) Body: ${options.text}`);
};
