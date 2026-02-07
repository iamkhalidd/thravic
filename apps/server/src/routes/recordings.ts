import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, AuthRequest } from '../middleware/auth';
import { domains } from './domains';

const router = Router();

// In-memory session recording storage
interface RecordingEvent {
    type: 'mousemove' | 'click' | 'scroll' | 'input' | 'resize' | 'pageview';
    timestamp: number; // Relative to session start
    data: Record<string, any>;
}

interface SessionRecording {
    id: string;
    domainId: string;
    trackingId: string;
    visitorId: string;
    sessionId: string;
    startedAt: Date;
    endedAt: Date | null;
    duration: number; // in seconds
    pageUrl: string;
    pagePath: string;
    userAgent: string;
    screenWidth: number;
    screenHeight: number;
    events: RecordingEvent[];
    eventCount: number;
    status: 'recording' | 'completed' | 'processing';
}

// Store recordings
const recordings: Map<string, SessionRecording> = new Map();

// Store active recording sessions
const activeSessions: Map<string, string> = new Map(); // sessionId -> recordingId

// POST /api/recordings/:domainId/start - Start a recording session
router.post('/:domainId/start', (req, res) => {
    const { trackingId, visitorId, sessionId, pageUrl, userAgent, screenWidth, screenHeight } = req.body;

    // Validate required fields
    if (!trackingId || !visitorId || !sessionId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if session already has a recording
    const existingRecordingId = activeSessions.get(sessionId);
    if (existingRecordingId) {
        return res.json({ recordingId: existingRecordingId, resumed: true });
    }

    let pagePath = '/';
    try {
        pagePath = new URL(pageUrl).pathname;
    } catch { }

    const recording: SessionRecording = {
        id: uuidv4(),
        domainId: req.params.domainId,
        trackingId,
        visitorId,
        sessionId,
        startedAt: new Date(),
        endedAt: null,
        duration: 0,
        pageUrl,
        pagePath,
        userAgent: userAgent || '',
        screenWidth: screenWidth || 1920,
        screenHeight: screenHeight || 1080,
        events: [],
        eventCount: 0,
        status: 'recording'
    };

    recordings.set(recording.id, recording);
    activeSessions.set(sessionId, recording.id);

    res.status(201).json({ recordingId: recording.id });
});

// POST /api/recordings/:domainId/events - Add events to a recording
router.post('/:domainId/events', (req, res) => {
    const { recordingId, events } = req.body;

    if (!recordingId || !Array.isArray(events)) {
        return res.status(400).json({ error: 'Missing recordingId or events' });
    }

    const recording = recordings.get(recordingId);
    if (!recording || recording.status !== 'recording') {
        return res.status(404).json({ error: 'Recording not found or not active' });
    }

    // Add events (limit to 10000 events per recording)
    const maxEvents = 10000;
    const remainingSlots = maxEvents - recording.events.length;

    if (remainingSlots > 0) {
        const eventsToAdd = events.slice(0, remainingSlots);
        recording.events.push(...eventsToAdd);
        recording.eventCount = recording.events.length;
    }

    // Update duration
    if (events.length > 0) {
        const lastEvent = events[events.length - 1];
        recording.duration = Math.max(recording.duration, lastEvent.timestamp / 1000);
    }

    recordings.set(recordingId, recording);

    res.json({
        success: true,
        eventCount: recording.eventCount,
        limitReached: recording.eventCount >= maxEvents
    });
});

// POST /api/recordings/:domainId/end - End a recording session
router.post('/:domainId/end', (req, res) => {
    const { recordingId } = req.body;

    if (!recordingId) {
        return res.status(400).json({ error: 'Missing recordingId' });
    }

    const recording = recordings.get(recordingId);
    if (!recording) {
        return res.status(404).json({ error: 'Recording not found' });
    }

    recording.endedAt = new Date();
    recording.status = 'completed';
    recordings.set(recordingId, recording);

    // Remove from active sessions
    activeSessions.delete(recording.sessionId);

    res.json({ success: true, duration: recording.duration });
});

// GET /api/recordings/:domainId - List recordings
router.get('/:domainId', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const { page = '1', limit = '20', status } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    let domainRecordings = Array.from(recordings.values())
        .filter(r => r.domainId === req.params.domainId);

    // Filter by status if provided
    if (status) {
        domainRecordings = domainRecordings.filter(r => r.status === status);
    }

    // Sort by start time descending
    domainRecordings.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    // Paginate
    const total = domainRecordings.length;
    const start = (pageNum - 1) * limitNum;
    const paginatedRecordings = domainRecordings.slice(start, start + limitNum);

    res.json({
        recordings: paginatedRecordings.map(r => ({
            id: r.id,
            visitorId: r.visitorId,
            sessionId: r.sessionId,
            startedAt: r.startedAt,
            endedAt: r.endedAt,
            duration: r.duration,
            pagePath: r.pagePath,
            screenWidth: r.screenWidth,
            screenHeight: r.screenHeight,
            eventCount: r.eventCount,
            status: r.status
        })),
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
        }
    });
});

// GET /api/recordings/:domainId/:recordingId - Get full recording for playback
router.get('/:domainId/:recordingId', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const recording = recordings.get(req.params.recordingId);

    if (!recording || recording.domainId !== req.params.domainId) {
        return res.status(404).json({ error: 'Recording not found' });
    }

    res.json(recording);
});

// DELETE /api/recordings/:domainId/:recordingId - Delete a recording
router.delete('/:domainId/:recordingId', authenticate, (req: AuthRequest, res: Response) => {
    const domain = domains.get(req.params.domainId);

    if (!domain || domain.userId !== req.userId) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const recording = recordings.get(req.params.recordingId);

    if (!recording || recording.domainId !== req.params.domainId) {
        return res.status(404).json({ error: 'Recording not found' });
    }

    recordings.delete(req.params.recordingId);
    activeSessions.delete(recording.sessionId);

    res.json({ message: 'Recording deleted' });
});

export { recordings };
export default router;
