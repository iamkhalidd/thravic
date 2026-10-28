import { describe, expect, it } from 'vitest';
import { INSTALL_PLATFORMS, getPlatformInstructions, loaderScript } from '../installGuides';

const SNIPPET = `<!-- Thravic Analytics -->
<script async src="https://api.thravic.com/tf.js" data-tracking-id="TF-2083C319"></script>
<!-- End Thravic Analytics -->`;
const VERIFY = 'Click Verify.';

describe('getPlatformInstructions', () => {
    it.each(INSTALL_PLATFORMS.map(p => p.id))('%s: carries the tracking id and ends on the verify step', id => {
        const { snippet, steps } = getPlatformInstructions(id, SNIPPET, VERIFY);
        expect(snippet).toContain('TF-2083C319');
        expect(steps.at(-1)).toContain('erify');
        expect(steps.length).toBeGreaterThanOrEqual(3);
    });

    it('lists every platform once', () => {
        const ids = INSTALL_PLATFORMS.map(p => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('gives Blogger an XML-safe async attribute', () => {
        const { snippet } = getPlatformInstructions('blogger', SNIPPET, VERIFY);
        expect(snippet).toContain('<script async="async" src="https://api.thravic.com/tf.js"');
    });

    it('mentions plan limits where the platform has them', () => {
        for (const id of ['wix', 'squarespace', 'webflow', 'carrd', 'bubble'] as const) {
            expect(getPlatformInstructions(id, SNIPPET, VERIFY).note).toMatch(/plan|Pro/);
        }
    });
});

describe('loaderScript', () => {
    it('loads the same tracker with the same id, as plain JavaScript', () => {
        const js = loaderScript(SNIPPET);
        expect(js).not.toContain('<script');
        expect(js).toContain("window.__TF_ID__ = 'TF-2083C319';");
        expect(js).toContain("s.src = 'https://api.thravic.com/tf.js';");
        expect(js).toContain('s.async = true;');
    });

    it('returns the input unchanged when it cannot read the tag', () => {
        expect(loaderScript('nope')).toBe('nope');
    });
});
