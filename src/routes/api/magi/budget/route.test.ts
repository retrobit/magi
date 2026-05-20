import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { GET } from './+server';
import { getProviderBudgets, type ProviderBudget } from '$lib/server/budget';

vi.mock('$env/dynamic/private', () => ({ env: {} as Record<string, string | undefined> }));
vi.mock('$lib/server/budget', () => ({ getProviderBudgets: vi.fn() }));
vi.mock('$lib/server/logger', () => ({ logEvent: vi.fn(), startTimer: vi.fn(() => () => 0) }));

const mockBudgets: ProviderBudget[] = [
	{ provider: 'openrouter', status: 'ok', usage: 1, limit: 10, remaining: 9 },
	{ provider: 'anthropic', status: 'unavailable', reason: 'ANTHROPIC_ADMIN_KEY not configured' },
	{ provider: 'openai', status: 'unavailable', reason: 'OPENAI_ADMIN_KEY not configured' },
	{ provider: 'google', status: 'unavailable', reason: 'no public usage API' }
];

function call(init: { headers?: Record<string, string>; force?: boolean } = {}) {
	const url = new URL(`http://localhost/api/magi/budget${init.force ? '?force=1' : ''}`);
	const request = new Request(url, {
		method: 'GET',
		headers: init.headers
	});
	return GET({ request, url } as unknown as Parameters<RequestHandler>[0]);
}

beforeEach(() => {
	vi.mocked(getProviderBudgets).mockResolvedValue(mockBudgets);
});

afterEach(() => {
	delete env.MAGI_API_KEY;
	vi.mocked(getProviderBudgets).mockReset();
});

describe('GET /api/magi/budget', () => {
	it('returns the provider list as JSON', async () => {
		vi.mocked(getProviderBudgets).mockResolvedValue(mockBudgets);
		const res = await call();
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.providers).toEqual(mockBudgets);
	});

	it('sets a private 60s Cache-Control header', async () => {
		vi.mocked(getProviderBudgets).mockResolvedValue(mockBudgets);
		const res = await call();
		expect(res.headers.get('cache-control')).toBe('private, max-age=60');
	});

	it('forwards force=1 to getProviderBudgets to bypass the cache', async () => {
		vi.mocked(getProviderBudgets).mockResolvedValue(mockBudgets);
		await call({ force: true });
		expect(getProviderBudgets).toHaveBeenCalledWith({ force: true });
	});

	it('omits force when the query param is absent', async () => {
		vi.mocked(getProviderBudgets).mockResolvedValue(mockBudgets);
		await call();
		expect(getProviderBudgets).toHaveBeenCalledWith({ force: false });
	});

	it('rejects an unauthenticated request when MAGI_API_KEY is set', async () => {
		env.MAGI_API_KEY = 'secret';
		const res = await call();
		expect(res.status).toBe(401);
		expect(getProviderBudgets).not.toHaveBeenCalled();
	});

	it('admits a request bearing the correct bearer token', async () => {
		env.MAGI_API_KEY = 'secret';
		const res = await call({ headers: { authorization: 'Bearer secret' } });
		expect(res.status).toBe(200);
	});

	it('returns 500 when the upstream fetcher throws', async () => {
		vi.mocked(getProviderBudgets).mockRejectedValue(new Error('boom'));
		const res = await call();
		expect(res.status).toBe(500);
		expect((await res.json()).error).toMatch(/Failed/);
	});
});
