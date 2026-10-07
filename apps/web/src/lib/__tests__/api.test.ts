import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportData, formatPlanPrice, payments, recordings, webhooks } from '../api';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('accessToken', 'access');
});

afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
});

describe('formatPlanPrice', () => {
    it('shows Free for a zero price', () => {
        expect(formatPlanPrice(0)).toBe('Free');
    });

    it('defaults to naira, which the config fallback plans omit', () => {
        expect(formatPlanPrice(45000)).toBe(`₦${(45000).toLocaleString()}`);
    });

    it('falls back to the currency code for an unknown currency', () => {
        expect(formatPlanPrice(10, 'KES')).toBe('KES 10');
    });
});

describe('payments.getPlans', () => {
    it('reads the public plans endpoint', async () => {
        const plans = [{ id: 'pro', name: 'Pro', price: 45000, currency: 'NGN' }];
        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, plans }));

        const result = await payments.getPlans();

        expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/payments\/plans$/);
        expect(result.data?.plans).toEqual(plans);
    });
});

describe('exportData.downloadCsv', () => {
    it('requests the CSV with the bearer token and triggers a download', async () => {
        fetchMock.mockResolvedValueOnce(new Response('Type,URL\n', { status: 200, headers: { 'Content-Type': 'text/csv' } }));
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        URL.createObjectURL = vi.fn(() => 'blob:csv');
        URL.revokeObjectURL = vi.fn();

        const result = await exportData.downloadCsv('dom-1', 'events');

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toMatch(/\/api\/export\/dom-1\?type=events$/);
        expect(init.headers).toEqual({ Authorization: 'Bearer access' });
        expect(click).toHaveBeenCalledOnce();
        expect(result).toEqual({});
    });

    it('surfaces the feature-gate upgrade prompt', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ error: 'The "export" feature is not available on the Free plan.', upgrade: true }, 403)
        );

        const result = await exportData.downloadCsv('dom-1', 'sessions');

        expect(result).toEqual({ error: 'The "export" feature is not available on the Free plan.', upgrade: true });
    });

    it('refreshes an expired token once and retries', async () => {
        localStorage.setItem('refreshToken', 'refresh');
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ error: 'Invalid or expired token' }, 401))
            .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' }))
            .mockResolvedValueOnce(new Response('Session ID\n', { status: 200 }));
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        URL.createObjectURL = vi.fn(() => 'blob:csv');
        URL.revokeObjectURL = vi.fn();

        const result = await exportData.downloadCsv('dom-1', 'sessions');

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[2][1].headers).toEqual({ Authorization: 'Bearer new-access' });
        expect(result).toEqual({});
    });

    it('stops after one failed retry instead of looping', async () => {
        localStorage.setItem('refreshToken', 'refresh');
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ error: 'Invalid or expired token' }, 401))
            .mockResolvedValueOnce(jsonResponse({ accessToken: 'a', refreshToken: 'r' }))
            .mockResolvedValueOnce(jsonResponse({ error: 'Invalid or expired token' }, 401));

        const result = await exportData.downloadCsv('dom-1', 'sessions');

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(result.error).toBe('Invalid or expired token');
    });
});

describe('recordings.list', () => {
    it('sends only the filters that are set', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ recordings: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }));

        await recordings.list('dom-1');
        await recordings.list('dom-1', { device: 'mobile', duration: 'long', page: 2 });

        expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/recordings\/dom-1$/);
        expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/recordings\/dom-1\?device=mobile&duration=long&page=2$/);
    });
});

describe('webhooks.create', () => {
    it('posts the url, events and secret', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'w1', url: 'https://example.com/h', events: ['click'], enabled: true, hasSecret: true, created_at: '' }, 201));

        const result = await webhooks.create('dom-1', { url: 'https://example.com/h', events: ['click'], secret: 's3cret' });

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toMatch(/\/api\/webhooks\/dom-1$/);
        expect(JSON.parse(init.body)).toEqual({ url: 'https://example.com/h', events: ['click'], secret: 's3cret' });
        expect(result.data?.hasSecret).toBe(true);
    });

    it('flattens the validation issue array into a readable message', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: [{ message: 'Invalid url' }, { message: 'Required' }] }, 400));

        const result = await webhooks.create('dom-1', { url: 'nope', events: [] });

        expect(result.error).toBe('Invalid url; Required');
    });

    it('passes a plain error message through', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Webhook URL must point to a public internet address' }, 400));

        const result = await webhooks.create('dom-1', { url: 'http://127.0.0.1/h', events: ['click'] });

        expect(result.error).toBe('Webhook URL must point to a public internet address');
    });
});

describe('payments.getUsage', () => {
    it('reads the usage endpoint', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, usage: { eventsThisMonth: 5, eventsLimit: 100, percentUsed: 5 } }));

        const result = await payments.getUsage();

        expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/payments\/usage$/);
        expect(result.data?.usage.percentUsed).toBe(5);
    });
});
