import { registerSchema, loginSchema, refreshSchema } from '../auth';

describe('Auth Validators', () => {
    describe('registerSchema', () => {
        it('validates a correct registration payload', () => {
            const result = registerSchema.safeParse({
                email: 'test@example.com',
                password: 'Password123!',
                name: 'Test User'
            });
            expect(result.success).toBe(true);
        });

        it('fails on invalid email', () => {
            const result = registerSchema.safeParse({
                email: 'not-an-email',
                password: 'Password123!',
                name: 'Test User'
            });
            expect(result.success).toBe(false);
        });

        it('fails on short password', () => {
            const result = registerSchema.safeParse({
                email: 'test@example.com',
                password: 'Ab1!',
                name: 'Test User'
            });
            expect(result.success).toBe(false);
        });

        it('fails on password without uppercase', () => {
            const result = registerSchema.safeParse({
                email: 'test@example.com',
                password: 'password123!',
                name: 'Test User'
            });
            expect(result.success).toBe(false);
        });

        it('fails on password without number', () => {
            const result = registerSchema.safeParse({
                email: 'test@example.com',
                password: 'Password!!!',
                name: 'Test User'
            });
            expect(result.success).toBe(false);
        });

        it('fails on password without special character', () => {
            const result = registerSchema.safeParse({
                email: 'test@example.com',
                password: 'Password123',
                name: 'Test User'
            });
            expect(result.success).toBe(false);
        });

        it('fails on name shorter than 2 characters', () => {
            const result = registerSchema.safeParse({
                email: 'test@example.com',
                password: 'Password123!',
                name: 'A'
            });
            expect(result.success).toBe(false);
        });

        it('fails when email is missing', () => {
            const result = registerSchema.safeParse({
                password: 'Password123!',
                name: 'Test User'
            });
            expect(result.success).toBe(false);
        });

        it('fails when password is missing', () => {
            const result = registerSchema.safeParse({
                email: 'test@example.com',
                name: 'Test User'
            });
            expect(result.success).toBe(false);
        });
    });

    describe('loginSchema', () => {
        it('validates correct login payload', () => {
            const result = loginSchema.safeParse({
                email: 'test@example.com',
                password: 'password123'
            });
            expect(result.success).toBe(true);
        });

        it('fails on invalid email', () => {
            const result = loginSchema.safeParse({
                email: 'invalid',
                password: 'password123'
            });
            expect(result.success).toBe(false);
        });

        it('fails on empty password', () => {
            const result = loginSchema.safeParse({
                email: 'test@example.com',
                password: ''
            });
            expect(result.success).toBe(false);
        });

        it('fails when both fields are missing', () => {
            const result = loginSchema.safeParse({});
            expect(result.success).toBe(false);
        });
    });

    describe('refreshSchema', () => {
        it('validates a valid refresh token', () => {
            const result = refreshSchema.safeParse({
                refreshToken: 'some-valid-token-string'
            });
            expect(result.success).toBe(true);
        });

        it('fails on empty refresh token', () => {
            const result = refreshSchema.safeParse({
                refreshToken: ''
            });
            expect(result.success).toBe(false);
        });

        it('fails when refresh token is missing', () => {
            const result = refreshSchema.safeParse({});
            expect(result.success).toBe(false);
        });
    });
});
