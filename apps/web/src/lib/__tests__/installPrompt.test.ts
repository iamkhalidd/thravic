import { describe, expect, it } from 'vitest';
import { buildInstallPrompt, nextScriptTag, parseTrackerTag, scriptTag } from '../installPrompt';

const SNIPPET = `<!-- Thravic Analytics -->
<script async src="https://thravic.onrender.com/tf.js" data-tracking-id="TF-2083C319"></script>
<!-- End Thravic Analytics -->`;

describe('parseTrackerTag', () => {
    it('reads src, tracking id and origin from the API snippet', () => {
        expect(parseTrackerTag(SNIPPET)).toEqual({
            src: 'https://thravic.onrender.com/tf.js',
            trackingId: 'TF-2083C319',
            origin: 'https://thravic.onrender.com',
        });
    });

    it('returns null without a tracking id', () => {
        expect(parseTrackerTag('<script src="https://x.test/tf.js"></script>')).toBeNull();
    });
});

describe('buildInstallPrompt', () => {
    const tag = parseTrackerTag(SNIPPET)!;
    const prompt = buildInstallPrompt(tag);

    it('carries the exact tag and the Next.js form', () => {
        expect(prompt).toContain(scriptTag(tag));
        expect(prompt).toContain(nextScriptTag(tag));
        expect(nextScriptTag(tag)).toBe(
            '<Script src="https://thravic.onrender.com/tf.js" data-tracking-id="TF-2083C319" strategy="afterInteractive" />',
        );
    });

    it('tells the agent how to allow and verify the tracker', () => {
        expect(prompt).toContain('allow https://thravic.onrender.com in script-src and connect-src');
        expect(prompt).toContain('https://thravic.onrender.com/api/collect/TF-2083C319/batch');
    });

    it('keeps the agent from bundling the tracker or adding privacy classes itself', () => {
        expect(prompt).toMatch(/Do not download, copy, bundle or self-host tf\.js/);
        expect(prompt).toMatch(/don't add the classes yourself/);
    });
});
