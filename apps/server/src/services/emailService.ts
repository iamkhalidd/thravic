// ──────────────────────────────────────────────
// TrackFlow — Email Service
// Supports Gmail SMTP (App Password) via nodemailer.
// Set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS in .env.
// Without those vars, emails are logged to console only (dev mode).
// ──────────────────────────────────────────────
import nodemailer from 'nodemailer';
import { createLogger } from '../config/logger';

const log = createLogger('Email');

export interface EmailOptions {
    to: string;
    subject: string;
    text: string;
    html?: string;
}

// ── Transport ────────────────────────────────────────────────────────────────

function createTransport() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        log.warn('SMTP not configured — emails will be logged to console only');
        return null;
    }

    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 587,
        secure: Number(SMTP_PORT) === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
}

let transporter: nodemailer.Transporter | null = null;

export function initEmailTransport() {
    transporter = createTransport();
}

// Auto-init on module load
initEmailTransport();

// ── Core send ────────────────────────────────────────────────────────────────

export const sendEmail = async (options: EmailOptions): Promise<void> => {
    const from = process.env.SMTP_FROM || 'TrackFlow <noreply@trackflow.app>';

    if (transporter) {
        try {
            await transporter.sendMail({ from, ...options });
            log.info(`Email sent — "${options.subject}" → ${options.to}`);
        } catch (err) {
            log.error(`Email failed → ${options.to}: ${(err as Error).message}`);
            throw err;
        }
        return;
    }

    // Dev fallback — log to console
    log.info(`[DEV EMAIL] To: ${options.to} | Subject: ${options.subject}`);
    log.info(`[DEV EMAIL] ${options.text}`);
};

// ── Shared HTML layout ───────────────────────────────────────────────────────

function layout(bodyHtml: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>TrackFlow</title>
</head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 36px;">
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
                📊 TrackFlow
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 36px;color:#e2e8f0;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #2a2a3e;text-align:center;">
              <p style="margin:0;font-size:12px;color:#6b7280;">
                TrackFlow Analytics · You're receiving this because you have an account with us.<br/>
                If you didn't perform this action, please <a href="mailto:support@trackflow.app" style="color:#8b5cf6;">contact support</a> immediately.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function btn(text: string, url: string): string {
    return `<a href="${url}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${text}</a>`;
}

function infoRow(label: string, value: string): string {
    return `<tr>
      <td style="padding:8px 12px;color:#9ca3af;font-size:13px;width:130px;">${label}</td>
      <td style="padding:8px 12px;color:#e2e8f0;font-size:13px;">${value}</td>
    </tr>`;
}

// ── Alert Templates ──────────────────────────────────────────────────────────

/** 1. Welcome email — sent on account creation */
export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    await sendEmail({
        to,
        subject: 'Welcome to TrackFlow 🎉',
        text: `Hi ${name},\n\nWelcome to TrackFlow! Your account is ready. Start tracking your first domain at ${frontendUrl}/dashboard.\n\nTrackFlow Team`,
        html: layout(`
          <h2 style="margin:0 0 8px;color:#fff;font-size:20px;">Welcome aboard, ${name}! 🎉</h2>
          <p style="margin:0 0 20px;color:#9ca3af;font-size:14px;line-height:1.6;">
            Your TrackFlow account is ready. Start tracking traffic, building funnels, and getting AI-powered insights for your website.
          </p>
          <table style="background:#0f0f1a;border-radius:8px;width:100%;border-collapse:collapse;margin-bottom:8px;">
            ${infoRow('Plan', 'Free — 10,000 events/mo')}
            ${infoRow('Domains', '1 domain included')}
          </table>
          ${btn('Open Dashboard →', `${frontendUrl}/dashboard`)}
          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
            Questions? Reply to this email and we'll help.
          </p>
        `),
    });
}

/** 2. Login alert — sent on every successful login */
export async function sendLoginAlertEmail(
    to: string,
    name: string,
    ip: string,
    userAgent: string,
    time: Date,
): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const timeStr = time.toUTCString();
    const device = userAgent.length > 80 ? userAgent.slice(0, 80) + '…' : userAgent;

    await sendEmail({
        to,
        subject: '🔐 New sign-in to your TrackFlow account',
        text: `Hi ${name},\n\nWe detected a new sign-in to your account.\n\nTime: ${timeStr}\nIP: ${ip}\nDevice: ${device}\n\nNot you? Secure your account at ${frontendUrl}/dashboard/settings`,
        html: layout(`
          <h2 style="margin:0 0 8px;color:#fff;font-size:20px;">New sign-in detected 🔐</h2>
          <p style="margin:0 0 20px;color:#9ca3af;font-size:14px;line-height:1.6;">
            Hi <strong style="color:#e2e8f0;">${name}</strong>, we noticed a new login to your TrackFlow account. Here are the details:
          </p>
          <table style="background:#0f0f1a;border-radius:8px;width:100%;border-collapse:collapse;margin-bottom:8px;">
            ${infoRow('Time', timeStr)}
            ${infoRow('IP Address', ip || 'Unknown')}
            ${infoRow('Device', device || 'Unknown')}
          </table>
          <div style="margin-top:20px;padding:14px 16px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;">
            <p style="margin:0;font-size:13px;color:#f87171;">
              ⚠️ <strong>Not you?</strong> Change your password immediately to secure your account.
            </p>
          </div>
          ${btn('Review Account Security →', `${frontendUrl}/dashboard/settings`)}
        `),
    });
}

/** 3. Password reset request */
export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
    await sendEmail({
        to,
        subject: 'TrackFlow — Reset your password',
        text: `You requested a password reset.\n\nClick here to reset: ${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
        html: layout(`
          <h2 style="margin:0 0 8px;color:#fff;font-size:20px;">Reset your password 🔑</h2>
          <p style="margin:0 0 20px;color:#9ca3af;font-size:14px;line-height:1.6;">
            We received a request to reset the password for your TrackFlow account. Click the button below to choose a new password.
          </p>
          <div style="margin-bottom:8px;">
            ${btn('Reset Password →', resetLink)}
          </div>
          <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">
            This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password won't be changed.
          </p>
        `),
    });
}

/** 4. Password changed confirmation */
export async function sendPasswordChangedEmail(to: string, name: string, ip: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const timeStr = new Date().toUTCString();

    await sendEmail({
        to,
        subject: '✅ Your TrackFlow password was changed',
        text: `Hi ${name},\n\nYour password was successfully changed.\n\nTime: ${timeStr}\nIP: ${ip}\n\nNot you? Contact support immediately.`,
        html: layout(`
          <h2 style="margin:0 0 8px;color:#fff;font-size:20px;">Password changed ✅</h2>
          <p style="margin:0 0 20px;color:#9ca3af;font-size:14px;line-height:1.6;">
            Hi <strong style="color:#e2e8f0;">${name}</strong>, your TrackFlow account password was just changed successfully.
          </p>
          <table style="background:#0f0f1a;border-radius:8px;width:100%;border-collapse:collapse;margin-bottom:8px;">
            ${infoRow('Time', timeStr)}
            ${infoRow('IP Address', ip || 'Unknown')}
          </table>
          <div style="margin-top:20px;padding:14px 16px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;">
            <p style="margin:0;font-size:13px;color:#f87171;">
              ⚠️ <strong>Wasn't you?</strong> Contact our support immediately — your account may be compromised.
            </p>
          </div>
          ${btn('Contact Support →', 'mailto:support@trackflow.app')}
        `),
    });
}

/** 5. Account suspended */
export async function sendAccountSuspendedEmail(to: string, name: string): Promise<void> {
    await sendEmail({
        to,
        subject: '⚠️ Your TrackFlow account has been suspended',
        text: `Hi ${name},\n\nYour TrackFlow account has been suspended. Please contact support@trackflow.app if you believe this is a mistake.`,
        html: layout(`
          <h2 style="margin:0 0 8px;color:#fff;font-size:20px;">Account suspended ⚠️</h2>
          <p style="margin:0 0 20px;color:#9ca3af;font-size:14px;line-height:1.6;">
            Hi <strong style="color:#e2e8f0;">${name}</strong>, your TrackFlow account has been suspended and you will no longer be able to log in.
          </p>
          <div style="padding:14px 16px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;">
            <p style="margin:0;font-size:13px;color:#f87171;">
              If you believe this is a mistake, please contact us and we'll review your account.
            </p>
          </div>
          ${btn('Contact Support →', 'mailto:support@trackflow.app')}
        `),
    });
}

/** 6. Account reactivated */
export async function sendAccountReactivatedEmail(to: string, name: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    await sendEmail({
        to,
        subject: '✅ Your TrackFlow account has been reactivated',
        text: `Hi ${name},\n\nGreat news! Your TrackFlow account has been reactivated. You can now log in at ${frontendUrl}/login`,
        html: layout(`
          <h2 style="margin:0 0 8px;color:#fff;font-size:20px;">Account reactivated ✅</h2>
          <p style="margin:0 0 20px;color:#9ca3af;font-size:14px;line-height:1.6;">
            Hi <strong style="color:#e2e8f0;">${name}</strong>, your TrackFlow account has been reactivated and you can now sign in again.
          </p>
          ${btn('Sign In →', `${frontendUrl}/login`)}
        `),
    });
}

/** 7. Payment / subscription receipt */
export async function sendPaymentReceiptEmail(
    to: string,
    name: string,
    plan: string,
    amount: number,
    reference: string,
): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);

    await sendEmail({
        to,
        subject: `🎉 TrackFlow — Payment confirmed (${planLabel} plan)`,
        text: `Hi ${name},\n\nPayment confirmed! You've been upgraded to the ${planLabel} plan.\n\nAmount: $${amount} USD\nPlan: ${planLabel}\nReference: ${reference}\nNext billing: ${periodEnd.toDateString()}\n\nManage your subscription at ${frontendUrl}/dashboard/settings`,
        html: layout(`
          <h2 style="margin:0 0 8px;color:#fff;font-size:20px;">Payment confirmed 🎉</h2>
          <p style="margin:0 0 20px;color:#9ca3af;font-size:14px;line-height:1.6;">
            Hi <strong style="color:#e2e8f0;">${name}</strong>, your payment was successful and your account has been upgraded!
          </p>
          <table style="background:#0f0f1a;border-radius:8px;width:100%;border-collapse:collapse;margin-bottom:8px;">
            ${infoRow('Plan', planLabel)}
            ${infoRow('Amount', `$${amount} USD`)}
            ${infoRow('Reference', reference)}
            ${infoRow('Next billing', periodEnd.toDateString())}
          </table>
          <div style="margin-top:16px;padding:14px 16px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:8px;">
            <p style="margin:0;font-size:13px;color:#4ade80;">
              ✅ Your ${planLabel} features are now active. Enjoy!
            </p>
          </div>
          ${btn('Open Dashboard →', `${frontendUrl}/dashboard`)}
        `),
    });
}
