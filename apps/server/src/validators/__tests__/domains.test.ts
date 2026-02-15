import { createDomainSchema, updateSettingsSchema } from '../domains';

describe('Domain Validators', () => {
    describe('createDomainSchema', () => {
        it('validates a valid domain', () => {
            const result = createDomainSchema.safeParse({ domain: 'example.com' });
            expect(result.success).toBe(true);
        });

        it('validates domain with subdomain', () => {
            const result = createDomainSchema.safeParse({ domain: 'app.example.com' });
            expect(result.success).toBe(true);
        });

        it('validates domain with optional name', () => {
            const result = createDomainSchema.safeParse({
                domain: 'example.com',
                name: 'My Website',
            });
            expect(result.success).toBe(true);
        });

        it('fails on domain shorter than 3 characters', () => {
            const result = createDomainSchema.safeParse({ domain: 'ab' });
            expect(result.success).toBe(false);
        });

        it('fails on domain with invalid characters', () => {
            const result = createDomainSchema.safeParse({ domain: 'exam ple.com' });
            expect(result.success).toBe(false);
        });

        it('fails on domain starting with hyphen', () => {
            const result = createDomainSchema.safeParse({ domain: '-example.com' });
            expect(result.success).toBe(false);
        });

        it('fails when domain is missing', () => {
            const result = createDomainSchema.safeParse({});
            expect(result.success).toBe(false);
        });
    });

    describe('updateSettingsSchema', () => {
        it('validates all boolean settings', () => {
            const result = updateSettingsSchema.safeParse({
                trackClicks: true,
                trackScrolls: false,
                trackForms: true,
                sessionRecording: true,
                heatmaps: false,
            });
            expect(result.success).toBe(true);
        });

        it('validates partial settings update', () => {
            const result = updateSettingsSchema.safeParse({ trackClicks: true });
            expect(result.success).toBe(true);
        });

        it('validates empty settings (no changes)', () => {
            const result = updateSettingsSchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it('fails on non-boolean value', () => {
            const result = updateSettingsSchema.safeParse({ trackClicks: 'yes' });
            expect(result.success).toBe(false);
        });
    });
});
