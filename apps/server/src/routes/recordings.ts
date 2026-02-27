import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireFeature } from '../middleware/featureGate';
import * as domainService from '../services/domainService';
import * as recordingService from '../services/recordingService';
import { appendEventsSchema, startRecordingSchema } from '../validators/recordings';
import { createLogger } from '../config/logger';

const log = createLogger('Recordings');

const router = Router();



// POST /api/recordings/:domainId/start - Start a new recording
router.post('/:domainId/start', authenticate, requireFeature('recordings'), async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const { sessionId, url } = req.body;

        const recording = await recordingService.create(domain.id, sessionId || null, url);

        res.status(201).json({
            id: recording.id,
            startedAt: recording.started_at,
            status: 'recording'
        });
    } catch (error) {
        log.error('Start recording error', error);
        res.status(500).json({ error: 'Failed to start recording' });
    }
});

// POST /api/recordings/:domainId/:recordingId/events - Append events to recording
router.post('/:domainId/:recordingId/events', authenticate, requireFeature('recordings'), async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const recording = await recordingService.getById(req.params.recordingId);
        if (!recording || recording.domain_id !== domain.id) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        const { events } = appendEventsSchema.parse(req.body);

        await recordingService.appendEvents(recording.id, events);

        res.json({ success: true, eventsAdded: events.length });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid event data' });
        }
        log.error('Append events error', error);
        res.status(500).json({ error: 'Failed to append events' });
    }
});

// POST /api/recordings/:domainId/:recordingId/end - End a recording
router.post('/:domainId/:recordingId/end', authenticate, requireFeature('recordings'), async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const recording = await recordingService.endRecording(req.params.recordingId);
        if (!recording || recording.domain_id !== domain.id) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        res.json({
            id: recording.id,
            duration: recording.duration,
            eventsCount: recording.events_count,
            status: 'completed'
        });
    } catch (error) {
        log.error('End recording error', error);
        res.status(500).json({ error: 'Failed to end recording' });
    }
});

// GET /api/recordings/:domainId - List recordings
router.get('/:domainId', authenticate, requireFeature('recordings'), async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
        const offset = (page - 1) * limit;

        const [recordings, total] = await Promise.all([
            recordingService.listByDomain(domain.id, limit, offset),
            recordingService.countByDomain(domain.id),
        ]);

        res.json({
            recordings: recordings.map(r => ({
                id: r.id,
                url: r.url,
                duration: r.duration,
                eventsCount: r.events_count,
                startedAt: r.started_at,
                endedAt: r.ended_at
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        log.error('List recordings error', error);
        res.status(500).json({ error: 'Failed to list recordings' });
    }
});

// GET /api/recordings/:domainId/:recordingId - Get single recording with full data
router.get('/:domainId/:recordingId', authenticate, requireFeature('recordings'), async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const recording = await recordingService.getById(req.params.recordingId);
        if (!recording || recording.domain_id !== domain.id) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        res.json({
            id: recording.id,
            url: recording.url,
            duration: recording.duration,
            eventsCount: recording.events_count,
            events: recording.recording_data?.events || [],
            startedAt: recording.started_at,
            endedAt: recording.ended_at
        });
    } catch (error) {
        log.error('Get recording error', error);
        res.status(500).json({ error: 'Failed to get recording' });
    }
});

// DELETE /api/recordings/:domainId/:recordingId - Delete recording
router.delete('/:domainId/:recordingId', authenticate, requireFeature('recordings'), async (req: AuthRequest, res: Response) => {
    try {
        const domain = await domainService.getById(req.params.domainId);
        if (!domain || domain.user_id !== req.userId) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const recording = await recordingService.getById(req.params.recordingId);
        if (!recording || recording.domain_id !== domain.id) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        await recordingService.remove(req.params.recordingId);
        res.json({ message: 'Recording deleted successfully' });
    } catch (error) {
        log.error('Delete recording error', error);
        res.status(500).json({ error: 'Failed to delete recording' });
    }
});

export default router;
