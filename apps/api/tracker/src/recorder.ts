/**
 * Screen-recording add-on, loaded by the tracker only on sites with session
 * recording on, so every other site keeps the small tracker.
 *
 * Exposes rrweb's `record` for the tracker to call; see startRecording() in index.ts.
 */
import { record } from '@rrweb/record';

(window as any).__TF_RRWEB__ = { record };
