import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestHandler } from './$types';
import { GET } from './+server';
import { getOpenRouterFreeModels } from '$lib/server/openrouter';
import { isModelHealthy } from '$lib/server/health';

vi.mock('$lib/server/openrouter', () => ({ getOpenRouterFreeModels: vi.fn() }));
vi.mock('$lib/server/health', () => ({ isModelHealthy: vi.fn(() => true) }));

function call(tier: string | null) {
	const url = new URL(`http://localhost/api/magi/models${tier === null ? '' : `?tier=${tier}`}`);
	return GET({ url } as unknown as Parameters<RequestHandler>[0]);
}

beforeEach(() => {
	vi.mocked(isModelHealthy).mockReturnValue(true);
});

describe('GET /api/magi/models', () => {
	it('rejects a missing tier with 400', async () => {
		const res = await call(null);
		expect(res.status).toBe(400);
		expect((await res.json()).error).toMatch(/Invalid tier/);
	});

	it('rejects an unknown tier with 400', async () => {
		const res = await call('platinum');
		expect(res.status).toBe(400);
	});

	it('returns the static registry models for a paid tier', async () => {
		const res = await call('balanced');
		expect(res.status).toBe(200);
		const { models } = await res.json();
		expect(models.length).toBeGreaterThan(0);
		for (const m of models) {
			expect(m).toMatchObject({
				id: expect.any(String),
				gateway: expect.any(String),
				provider: expect.any(String),
				displayName: expect.any(String)
			});
		}
		expect(getOpenRouterFreeModels).not.toHaveBeenCalled();
	});

	it('resolves the free tier from OpenRouter', async () => {
		vi.mocked(getOpenRouterFreeModels).mockResolvedValue([
			{ id: 'a/m1:free', gateway: 'openrouter', provider: 'a', displayName: 'M1' },
			{ id: 'b/m2:free', gateway: 'openrouter', provider: 'b', displayName: 'M2' }
		]);
		const res = await call('free');
		expect(res.status).toBe(200);
		expect((await res.json()).models.map((m: { id: string }) => m.id)).toEqual([
			'a/m1:free',
			'b/m2:free'
		]);
	});

	it('drops unhealthy models from the free-tier list', async () => {
		vi.mocked(getOpenRouterFreeModels).mockResolvedValue([
			{ id: 'a/m1:free', gateway: 'openrouter', provider: 'a', displayName: 'M1' },
			{ id: 'b/m2:free', gateway: 'openrouter', provider: 'b', displayName: 'M2' }
		]);
		vi.mocked(isModelHealthy).mockImplementation((id) => id !== 'b/m2:free');
		const res = await call('free');
		expect((await res.json()).models.map((m: { id: string }) => m.id)).toEqual(['a/m1:free']);
	});
});
