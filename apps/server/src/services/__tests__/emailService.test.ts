// Mock nodemailer before importing the module under test
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });

jest.mock('nodemailer', () => ({
    createTransport: jest.fn().mockReturnValue({
        sendMail: mockSendMail,
    }),
}));

// Suppress logger output during tests
jest.mock('../../middleware/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

import nodemailer from 'nodemailer';

const emailOptions = {
    to: 'user@example.com',
    subject: 'Welcome!',
    text: 'Hello from TrackFlow',
    html: '<p>Hello from TrackFlow</p>',
};

describe('Email Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('with SMTP configured', () => {
        beforeAll(() => {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '587';
            process.env.SMTP_USER = 'user';
            process.env.SMTP_PASS = 'pass';
            process.env.SMTP_FROM = 'Test <test@example.com>';
        });

        afterAll(() => {
            delete process.env.SMTP_HOST;
            delete process.env.SMTP_PORT;
            delete process.env.SMTP_USER;
            delete process.env.SMTP_PASS;
            delete process.env.SMTP_FROM;
        });

        it('sends email via SMTP transport', async () => {
            // Re-import to pick up env changes
            jest.resetModules();
            jest.mock('nodemailer', () => ({
                createTransport: jest.fn().mockReturnValue({
                    sendMail: mockSendMail,
                }),
            }));
            jest.mock('../../middleware/logger', () => ({
                logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            }));

            const { sendEmail, initEmailTransport } = require('../emailService');
            initEmailTransport();

            await sendEmail(emailOptions);

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'user@example.com',
                    subject: 'Welcome!',
                    text: 'Hello from TrackFlow',
                    html: '<p>Hello from TrackFlow</p>',
                })
            );
        });

        it('uses SMTP_FROM env var as sender', async () => {
            jest.resetModules();
            jest.mock('nodemailer', () => ({
                createTransport: jest.fn().mockReturnValue({
                    sendMail: mockSendMail,
                }),
            }));
            jest.mock('../../middleware/logger', () => ({
                logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            }));

            const { sendEmail, initEmailTransport } = require('../emailService');
            initEmailTransport();

            await sendEmail(emailOptions);

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: 'Test <test@example.com>',
                })
            );
        });

        it('throws when SMTP transport fails', async () => {
            const failMock = jest.fn().mockRejectedValue(new Error('SMTP connection refused'));

            jest.resetModules();
            jest.mock('nodemailer', () => ({
                createTransport: jest.fn().mockReturnValue({
                    sendMail: failMock,
                }),
            }));
            jest.mock('../../middleware/logger', () => ({
                logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            }));

            const { sendEmail, initEmailTransport } = require('../emailService');
            initEmailTransport();

            await expect(sendEmail(emailOptions)).rejects.toThrow('SMTP connection refused');
        });
    });

    describe('without SMTP configured (dev fallback)', () => {
        it('logs email to console instead of sending', async () => {
            // Remove SMTP env vars
            delete process.env.SMTP_HOST;
            delete process.env.SMTP_USER;
            delete process.env.SMTP_PASS;

            jest.resetModules();
            jest.mock('nodemailer', () => ({
                createTransport: jest.fn(),
            }));

            const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
            jest.mock('../../middleware/logger', () => ({ logger: loggerMock }));

            const { sendEmail, initEmailTransport } = require('../emailService');
            initEmailTransport();

            await sendEmail(emailOptions);

            // Should NOT call sendMail
            expect(mockSendMail).not.toHaveBeenCalled();
            // Should log the email details
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('user@example.com')
            );
        });
    });
});
