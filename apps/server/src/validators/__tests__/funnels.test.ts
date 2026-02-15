import { stepSchema, createFunnelSchema, updateFunnelSchema } from '../funnels';

const validStep = {
    name: 'Visit Homepage',
    type: 'pageview' as const,
    matchValue: '/home',
};

const validFunnel = {
    name: 'Signup Funnel',
    steps: [
        { name: 'Visit Homepage', type: 'pageview' as const, matchValue: '/' },
        { name: 'Click Register', type: 'click' as const, matchValue: '#register-btn' },
    ],
};

describe('Funnel Validators', () => {
    describe('stepSchema', () => {
        it('validates a valid step', () => {
            const result = stepSchema.safeParse(validStep);
            expect(result.success).toBe(true);
        });

        it('validates all step types', () => {
            const types = ['pageview', 'click', 'custom'] as const;
            types.forEach(type => {
                const result = stepSchema.safeParse({ ...validStep, type });
                expect(result.success).toBe(true);
            });
        });

        it('defaults matchType to contains', () => {
            const result = stepSchema.safeParse(validStep);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.matchType).toBe('contains');
            }
        });

        it('fails on invalid step type', () => {
            const result = stepSchema.safeParse({ ...validStep, type: 'hover' });
            expect(result.success).toBe(false);
        });

        it('fails on empty step name', () => {
            const result = stepSchema.safeParse({ ...validStep, name: '' });
            expect(result.success).toBe(false);
        });

        it('fails on empty matchValue', () => {
            const result = stepSchema.safeParse({ ...validStep, matchValue: '' });
            expect(result.success).toBe(false);
        });
    });

    describe('createFunnelSchema', () => {
        it('validates a valid funnel with 2 steps', () => {
            const result = createFunnelSchema.safeParse(validFunnel);
            expect(result.success).toBe(true);
        });

        it('defaults description to empty string', () => {
            const result = createFunnelSchema.safeParse(validFunnel);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.description).toBe('');
            }
        });

        it('fails on fewer than 2 steps', () => {
            const result = createFunnelSchema.safeParse({
                name: 'Tiny Funnel',
                steps: [validStep],
            });
            expect(result.success).toBe(false);
        });

        it('fails on more than 10 steps', () => {
            const result = createFunnelSchema.safeParse({
                name: 'Huge Funnel',
                steps: Array(11).fill(validStep),
            });
            expect(result.success).toBe(false);
        });

        it('fails when funnel name is missing', () => {
            const result = createFunnelSchema.safeParse({
                steps: validFunnel.steps,
            });
            expect(result.success).toBe(false);
        });
    });

    describe('updateFunnelSchema', () => {
        it('validates a partial update with just name', () => {
            const result = updateFunnelSchema.safeParse({ name: 'Updated Funnel' });
            expect(result.success).toBe(true);
        });

        it('validates an empty update (no changes)', () => {
            const result = updateFunnelSchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it('fails when steps array has fewer than 2 items', () => {
            const result = updateFunnelSchema.safeParse({
                steps: [validStep],
            });
            expect(result.success).toBe(false);
        });
    });
});
