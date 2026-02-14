import { registerSchema, loginSchema } from '../auth';

describe('Auth Validators', () => {
    describe('registerSchema', () => {
        it('validates a correct user registration payload', () => {
            const valid = {
                email: 'test@example.com',
                password: 'Password123!',
                name: 'Test User'
            };
            const result = registerSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });

        it('fails on weak password', () => {
            const weak = {
                email: 'test@example.com',
                password: 'password', // no uppercase, no number, no special
                name: 'Test User'
            };
            const result = registerSchema.safeParse(weak);
            expect(result.success).toBe(false);
        });

        it('fails on invalid email', () => {
            const invalid = {
                email: 'not-an-email',
                password: 'Password123!',
                name: 'Test User'
            };
            const result = registerSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });
    });

    describe('loginSchema', () => {
        it('validates correct login payload', () => {
            const valid = {
                email: 'test@example.com',
                password: 'password123'
            };
            const result = loginSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });
    });
});
