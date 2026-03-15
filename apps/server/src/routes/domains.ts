import { Router, Response } from 'express';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as domainService from '../services/domainService';
import { createDomainSchema, updateSettingsSchema } from '../validators/domains';
import { createLogger } from '../config/logger';

const log = createLogger('Domains');

const router = Router();


// Generate cryptographically secure tracking ID
function generateTrackingId(): string {
    return `TF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// GET /api/domains - List user's domains
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userDomains = await domainService.listByUser(req.userId!);

        res.json({
            domains: userDomains.map(d => ({
                id: d.id,
                domain: d.domain,
                name: d.name,
                trackingId: d.tracking_id,
                verified: d.verified,
                createdAt: d.created_at
            }))
        });
    } catch (error) {
        log.error('List domains error', error);
        res.status(500).json({ error: 'Failed to list domains' });
    }
});

// POST /api/domains - Create new domain
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { domain: domainUrl, name } = createDomainSchema.parse(req.body);

        const domain = await domainService.create(
            req.userId!,
            domainUrl,
            name || domainUrl,
            generateTrackingId()
        );

        res.status(201).json({
            id: domain.id,
            domain: domain.domain,
            name: domain.name,
            trackingId: domain.tracking_id,
            verified: domain.verified
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        // PostgreSQL unique constraint violation
        if (error?.code === '23505') {
            return res.status(400).json({ error: 'Domain already added' });
        }
        log.error('Create domain error', error);
        res.status(500).json({ error: 'Failed to create domain' });
    }
});

// GET /api/domains/:id - Get domain details
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.id);

        if (!domain || !(await domainService.hasAccess(domain.id, req.userId!))) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        res.json({
            id: domain.id,
            domain: domain.domain,
            name: domain.name,
            trackingId: domain.tracking_id,
            verified: domain.verified,
            createdAt: domain.created_at
        });
    } catch (error) {
        log.error('Get domain error', error);
        res.status(500).json({ error: 'Failed to get domain' });
    }
});

// GET /api/domains/:id/script - Get tracking script snippet
router.get('/:id/script', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.id);

        if (!domain || !(await domainService.hasAccess(domain.id, req.userId!))) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const apiUrl = process.env.SERVER_URL || process.env.API_URL || '';
        if (!apiUrl) {
            log.warn('SERVER_URL and API_URL env vars are not set — tracking script will have an empty src URL. Set SERVER_URL to your production backend URL.');
        }

        const script = `<!-- Thravic Analytics -->
<script async src="${apiUrl}/tf.js" data-tracking-id="${domain.tracking_id}"></script>
<!-- End Thravic Analytics -->`;

        res.json({
            trackingId: domain.tracking_id,
            script,
            instructions: [
                'Copy the script above',
                'Paste it in the <head> section of your website',
                'The script will automatically start tracking page views',
                'Return here to verify the installation'
            ]
        });
    } catch (error) {
        log.error('Get script error', error);
        res.status(500).json({ error: 'Failed to get script' });
    }
});

// Helper: fetch a URL and return the body as a string (follows one redirect)
function fetchHtml(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { timeout: 8000, headers: { 'User-Agent': 'Thravic-Verifier/1.0' } }, (res) => {
            // Follow a single redirect
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                fetchHtml(res.headers.location).then(resolve).catch(reject);
                return;
            }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => {
                body += chunk;
                // Stop reading after 500KB — we only need the <head>
                if (body.length > 512000) res.destroy();
            });
            res.on('end', () => resolve(body));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    });
}

// POST /api/domains/:id/verify - Verify domain installation
router.post('/:id/verify', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.id);

        if (!domain || !(await domainService.hasAccess(domain.id, req.userId!))) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        // Normalise domain → URL
        const rawDomain = domain.domain.trim();
        const siteUrl = rawDomain.startsWith('http') ? rawDomain : `https://${rawDomain}`;

        log.info(`Verifying tracking script on ${siteUrl} for tracking ID ${domain.tracking_id}`);

        let html = '';
        try {
            html = await fetchHtml(siteUrl);
        } catch (fetchErr: any) {
            log.warn(`Could not fetch ${siteUrl}: ${fetchErr.message}`);
            return res.json({
                verified: false,
                message: `Could not reach your site at ${siteUrl}. Make sure it is publicly accessible, then try again.`
            });
        }

        const scriptFound = html.includes(domain.tracking_id);

        if (!scriptFound) {
            log.info(`Tracking ID ${domain.tracking_id} NOT found on ${siteUrl}`);
            return res.json({
                verified: false,
                message: `Script not detected on ${rawDomain}. Make sure you pasted the full snippet inside the <head> tag and redeployed your site.`
            });
        }

        await domainService.verify(domain.id);
        log.info(`Tracking ID ${domain.tracking_id} verified on ${siteUrl}`);

        res.json({
            verified: true,
            message: 'Domain verified successfully'
        });
    } catch (error) {
        log.error('Verify domain error', error);
        res.status(500).json({ error: 'Failed to verify domain' });
    }
});

// PATCH /api/domains/:id/settings - Update domain settings
router.patch('/:id/settings', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.id);

        if (!domain || !(await domainService.hasAccess(domain.id, req.userId!))) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const settings = updateSettingsSchema.parse(req.body);

        // Note: Settings are not in the domains table schema — 
        // you may want to add a JSONB 'settings' column or a separate table.
        // For now, return the validated settings.
        res.json({ settings });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// DELETE /api/domains/:id - Delete domain
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.id);

        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        await domainService.remove(req.params.id);

        res.json({ message: 'Domain deleted successfully' });
    } catch (error) {
        log.error('Delete domain error', error);
        res.status(500).json({ error: 'Failed to delete domain' });
    }
});

export default router;
