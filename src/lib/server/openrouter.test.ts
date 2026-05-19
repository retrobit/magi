import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOpenRouterFreeModels, _testing } from './openrouter';

const sampleApi = {
	data: [
		{ id: 'zeta/model-a:free', name: 'Zeta: Model A (free)', context_length: 8000 },
		{ id: 'alpha/model-b:free', name: 'alpha/model-b', context_length: 16000 },
		{ id: 'paid/model-c', name: 'Paid Model', context_length: 32000 }
	]
};

function okFetch(payload: unknown) {
	return vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));
}

beforeEach(() => {
	_testing.clearCache();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('getOpenRouterFreeModels', () => {
	it('keeps only :free models and maps them onto AvailableModel', async () => {
		vi.stubGlobal('fetch', okFetch(sampleApi));
		const models = await getOpenRouterFreeModels();
		expect(models).toHaveLength(2);
		expect(models.find((m) => m.id === 'alpha/model-b:free')).toMatchObject({
			gateway: 'openrouter',
			provider: 'alpha',
			contextLength: 16000
		});
		expect(models.some((m) => m.id === 'paid/model-c')).toBe(false);
	});

	it('sorts the results by provider', async () => {
		vi.stubGlobal('fetch', okFetch(sampleApi));
		const models = await getOpenRouterFreeModels();
		expect(models.map((m) => m.provider)).toEqual(['alpha', 'zeta']);
	});

	it('strips a trailing "(free)" and a leading "vendor:" from display names', async () => {
		vi.stubGlobal('fetch', okFetch(sampleApi));
		const models = await getOpenRouterFreeModels();
		expect(models.find((m) => m.id === 'zeta/model-a:free')!.displayName).toBe('Model A');
	});

	it('serves a cached result without a second fetch inside the TTL', async () => {
		const fetchMock = okFetch(sampleApi);
		vi.stubGlobal('fetch', fetchMock);
		await getOpenRouterFreeModels();
		await getOpenRouterFreeModels();
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('refetches once the 10-minute TTL has elapsed', async () => {
		vi.useFakeTimers();
		const fetchMock = okFetch(sampleApi);
		vi.stubGlobal('fetch', fetchMock);
		await getOpenRouterFreeModels();
		vi.advanceTimersByTime(11 * 60_000);
		await getOpenRouterFreeModels();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('returns an empty list when the request fails and nothing is cached', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: false, status: 500 }))
		);
		expect(await getOpenRouterFreeModels()).toEqual([]);
	});

	it('returns an empty list when fetch itself rejects', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('network down');
			})
		);
		expect(await getOpenRouterFreeModels()).toEqual([]);
	});

	it('falls back to the last good cache when a later refetch fails', async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => sampleApi })
			.mockResolvedValueOnce({ ok: false, status: 503 });
		vi.stubGlobal('fetch', fetchMock);
		const first = await getOpenRouterFreeModels();
		vi.advanceTimersByTime(11 * 60_000);
		const second = await getOpenRouterFreeModels();
		expect(second).toEqual(first);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
