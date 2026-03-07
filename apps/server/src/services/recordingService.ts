// ──────────────────────────────────────────────
// Thravic — Recording Service
// ──────────────────────────────────────────────
import { query, queryOne } from '../db';

export interface RecordingRow {
    id: string;
    domain_id: string;
    session_id: string | null;
    url: string;
    duration: number | null;
    events_count: number | null;
    recording_data: any;
    started_at: Date;
    ended_at: Date | null;
}

/**
 * Start a new recording session.
 */
export async function create(
    domainId: string,
    sessionId: string | null,
    url: string
): Promise<RecordingRow> {
    const rows = await query<RecordingRow>(
        `INSERT INTO session_recordings (domain_id, session_id, url, recording_data)
         VALUES ($1, $2, $3, '{"events":[]}')
         RETURNING *`,
        [domainId, sessionId, url]
    );
    return rows[0];
}

/**
 * Append events to an existing recording.
 */
export async function appendEvents(
    recordingId: string,
    newEvents: any[]
): Promise<RecordingRow | null> {
    return queryOne<RecordingRow>(
        `UPDATE session_recordings
         SET recording_data = jsonb_set(
                recording_data,
                '{events}',
                (recording_data->'events')::jsonb || $2::jsonb
             ),
             events_count = COALESCE(events_count, 0) + $3
         WHERE id = $1
         RETURNING *`,
        [recordingId, JSON.stringify(newEvents), newEvents.length]
    );
}

/**
 * End a recording session (set ended_at and compute duration).
 */
export async function endRecording(recordingId: string): Promise<RecordingRow | null> {
    return queryOne<RecordingRow>(
        `UPDATE session_recordings
         SET ended_at = NOW(),
             duration = EXTRACT(EPOCH FROM (NOW() - started_at))::int
         WHERE id = $1
         RETURNING *`,
        [recordingId]
    );
}

/**
 * List recordings for a domain with pagination.
 */
export async function listByDomain(
    domainId: string,
    limit: number = 20,
    offset: number = 0
): Promise<RecordingRow[]> {
    // Return without the full recording_data blob for list views
    return query<RecordingRow>(
        `SELECT id, domain_id, session_id, url, duration, events_count,
                started_at, ended_at, NULL as recording_data
         FROM session_recordings
         WHERE domain_id = $1
         ORDER BY started_at DESC
         LIMIT $2 OFFSET $3`,
        [domainId, limit, offset]
    );
}

/**
 * Get a single recording by ID (includes full recording data).
 */
export async function getById(id: string): Promise<RecordingRow | null> {
    return queryOne<RecordingRow>(
        `SELECT * FROM session_recordings WHERE id = $1`,
        [id]
    );
}

/**
 * Delete a recording by ID.
 */
export async function remove(id: string): Promise<void> {
    await query(`DELETE FROM session_recordings WHERE id = $1`, [id]);
}

/**
 * Count recordings for a domain.
 */
export async function countByDomain(domainId: string): Promise<number> {
    const row = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM session_recordings WHERE domain_id = $1`,
        [domainId]
    );
    return parseInt(row?.count || '0', 10);
}
