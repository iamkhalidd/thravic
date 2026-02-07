import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// In-memory storage (replace with PostgreSQL in production)
interface Domain {
    id: string;
    userId: string;
    domain: string;
    trackingId: string;
    name: string;
    verified: boolean;
    createdAt: Date;
    settings: {
        trackClicks: boolean;
        trackScrolls: boolean;
        trackForms: boolean;
        sessionRecording: boolean;
        heatmaps: boolean;
    };
}

const domains: Map<string, Domain> = new Map();

// Validation schemas
const createDomainSchema = z.object({
    domain: z.string().min(3).regex(/^[a-zA-Z0-9][a-zA-Z0-9-_.]+[a-zA-Z0-9]$/),
    name: z.string().min(1).optional()
});

const updateSettingsSchema = z.object({
    trackClicks: z.boolean().optional(),
    trackScrolls: z.boolean().optional(),
    trackForms: z.boolean().optional(),
    sessionRecording: z.boolean().optional(),
    heatmaps: z.boolean().optional()
});

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
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
    const userDomains = Array.from(domains.values())
        .filter(d => d.userId === req.userId)
        .map(d => ({
            id: d.id,
            domain: d.domain,
            name: d.name,
            trackingId: d.trackingId,
            verified: d.verified,
            createdAt: d.createdAt,
            settings: d.settings
        }));

    res.json({ domains: userDomains });
});

// POST /api/domains - Create new domain
router.post('/', authenticate, (req: AuthRequest, res: Response) => {
    try {
        const { domain: domainUrl, name } = createDomainSchema.parse(req.body);

        // Check if domain already exists for this user
        const existingDomain = Array.from(domains.values()).find(
            d => d.userId === req.userId && d.domain === domainUrl
        );

        if (existingDomain) {
            return res.status(400).json({ error: 'Domain already added' });
        }

        // Create domain
        const domain: Domain = {
            id: uuidv4(),
            userId: req.userId!,
            domain: domainUrl,
            trackingId: generateTrackingId(),
            name: name || domainUrl,
            verified: false,
            createdAt: new Date(),
            settings: {
                trackClicks: true,
                trackScrolls: true,
                trackForms: true,
                sessionRecording: false,
                heatmaps: true
            }
        };

        domains.set(domain.id, domain);

        res.status(201).json({
            id: domain.id,
            domain: domain.domain,
            name: domain.name,
            trackingId: domain.trackingId,
            verified: domain.verified,
            settings: domain.settings
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Create domain error:', error);
        res.status(500).json({ error: 'Failed to create domain' });
    }
});

// GET /api/domains/:id - Get domain details
router.get('/:id', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.id);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    res.json({
        id: domain.id,
        domain: domain.domain,
        name: domain.name,
        trackingId: domain.trackingId,
        verified: domain.verified,
        createdAt: domain.createdAt,
        settings: domain.settings
    });
});

// GET /api/domains/:id/script - Get tracking script snippet
router.get('/:id/script', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.id);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const apiUrl = process.env.API_URL || 'http://localhost:3001';

    const script = `<!-- TrackFlow Analytics -->
<script>
(function(w,d,s,t){
  w.TF=w.TF||function(){(w.TF.q=w.TF.q||[]).push(arguments)};
  w.TF.id="${domain.trackingId}";
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
        trackingId: domain.trackingId,
        script,
        instructions: [
            'Copy the script above',
            'Paste it in the <head> section of your website',
            'The script will automatically start tracking page views',
            'Return here to verify the installation'
        ]
    });
});

// POST /api/domains/:id/verify - Verify domain installation
router.post('/:id/verify', authenticate, async (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.id);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    // In production, would check if we've received any events from this domain
    // For now, mark as verified
    domain.verified = true;
    domains.set(domain.id, domain);

    res.json({
        verified: true,
        message: 'Domain verified successfully'
    });
});

// PATCH /api/domains/:id/settings - Update domain settings
router.patch('/:id/settings', authenticate, (req: AuthRequest, res: Response) => {
    try {
        const domain = domains.get(req.params.id);

        if (!domain || domain.userId !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const settings = updateSettingsSchema.parse(req.body);
        domain.settings = { ...domain.settings, ...settings };
        domains.set(domain.id, domain);

        res.json({ settings: domain.settings });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// DELETE /api/domains/:id - Delete domain
router.delete('/:id', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.id);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    domains.delete(req.params.id);

    res.json({ message: 'Domain deleted successfully' });
});

// Export for use in other modules
export { domains };
export default router;
