import { Router } from 'express';
import { z } from 'zod';
import { sendEmail } from '../services/emailService';
import { createLogger } from '../config/logger';

const log = createLogger('Route:Contact');
const router = Router();

const contactSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    type: z.string().min(1, 'Inquiry type is required'),
    subject: z.string().min(1, 'Subject is required'),
    message: z.string().min(1, 'Message is required'),
});

router.post('/', async (req, res) => {
    try {
        const data = contactSchema.parse(req.body);
        
        const recipient = 'thravic247@gmail.com';
        
        log.info(`New contact form submission from ${data.email} (${data.type})`);

        await sendEmail({
            to: recipient,
            subject: `[Contact Form] ${data.type}: ${data.subject}`,
            text: `
New Contact Form Submission

Name: ${data.name}
Email: ${data.email}
Type: ${data.type}
Subject: ${data.subject}

Message:
${data.message}
            `,
            html: `
                <div style="font-family: sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
                    <h2 style="color: #000; border-bottom: 2px solid #f4f5f6; padding-bottom: 10px;">New Contact Submission</h2>
                    <p><strong>From:</strong> ${data.name} (&lt;${data.email}&gt;)</p>
                    <p><strong>Inquiry Type:</strong> ${data.type}</p>
                    <p><strong>Subject:</strong> ${data.subject}</p>
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin-top: 20px; white-space: pre-wrap;">
                        ${data.message.replace(/\n/g, '<br>')}
                    </div>
                    <p style="font-size: 12px; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
                        This message was sent from the Thravic Contact Us form.
                    </p>
                </div>
            `
        });

        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation failed', details: error.errors });
        }
        log.error('Contact form submission failed', error);
        res.status(500).json({ error: 'Failed to send message. Please try again later.' });
    }
});

export default router;
