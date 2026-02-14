import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as domainService from '../services/domainService';
import { createDomainSchema, updateSettingsSchema } from '../validators/domains';

const router = Router();



// Generate tracking ID
function generateTrackingId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'TF-';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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
        console.error('List domains error:', error);
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
        console.error('Create domain error:', error);
        res.status(500).json({ error: 'Failed to create domain' });
    }
});

// GET /api/domains/:id - Get domain details
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.id);

        if (!domain || domain.user_id !== req.userId) {
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
        console.error('Get domain error:', error);
        res.status(500).json({ error: 'Failed to get domain' });
    }
});

// GET /api/domains/:id/script - Get tracking script snippet
router.get('/:id/script', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.id);

        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const apiUrl = process.env.API_URL || 'http://localhost:3001';

        const script = `<!-- TrackFlow Analytics -->
<script>
(function(w,d,s,t){
  w.TF=w.TF||function(){(w.TF.q=w.TF.q||[]).push(arguments)};
  w.TF.id="${domain.tracking_id}";
  var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s);
  j.async=true;
  j.src="${apiUrl}/v.js";
  f.parentNode.insertBefore(j,f);
})(window,document,"script");
TF("init");
</script>
<!-- End TrackFlow Analytics -->`;

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
        console.error('Get script error:', error);
        res.status(500).json({ error: 'Failed to get script' });
    }
});

// POST /api/domains/:id/verify - Verify domain installation
router.post('/:id/verify', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.id);

        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        await domainService.verify(domain.id);

        res.json({
            verified: true,
            message: 'Domain verified successfully'
        });
    } catch (error) {
        console.error('Verify domain error:', error);
        res.status(500).json({ error: 'Failed to verify domain' });
    }
});

// PATCH /api/domains/:id/settings - Update domain settings
router.patch('/:id/settings', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.id);

        if (!domain || domain.user_id !== req.userId) {
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
        console.error('Delete domain error:', error);
        res.status(500).json({ error: 'Failed to delete domain' });
    }
});

export default router;
