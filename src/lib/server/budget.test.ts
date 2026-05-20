import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env as _env } from '$env/dynamic/private';
import { getProviderBudgets, _testing } from './budget';

interface MutableEnv {
	OPENROUTER_API_KEY?: string;
	ANTHROPIC_ADMIN_KEY?: string;
	OPENAI_ADMIN_KEY?: string;
}

const env = _env as unknown as MutableEnv;

vi.mock('$env/dynamic/private', () => ({ env: {} as MutableEnv }));

function okFetch(payload: unknown) {
	return vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));
}

beforeEach(() => {
	_testing.clearCache();
	env.OPENROUTER_API_KEY = 'or-key';
	delete env.ANTHROPIC_ADMIN_KEY;
	delete env.OPENAI_ADMIN_KEY;
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	delete env.OPENROUTER_API_KEY;
	delete env.ANTHROPIC_ADMIN_KEY;
	delete env.OPENAI_ADMIN_KEY;
});

describe('getProviderBudgets', () => {
	it('returns ok for OpenRouter with usage + limit + remaining derived', async () => {
		vi.stubGlobal(
			'fetch',
			okFetch({
				data: { label: 'Default', usage: 7.2, limit: 10, limit_remaining: 2.8, is_free_tier: false }
			})
		);
		const [or] = await getProviderBudgets();
		expect(or).toMatchObject({
			provider: 'openrouter',
			status: 'ok',
			label: 'Default',
			usage: 7.2,
			limit: 10,
			remaining: 2.8,
			isFreeKey: false
		});
	});

	it('derives `remaining` from limit - usage when the API omits limit_remaining', async () => {
		vi.stubGlobal('fetch', okFetch({ data: { usage: 3, limit: 10 } }));
		const [or] = await getProviderBudgets();
		expect(or.remaining).toBe(7);
	});

	it('handles an uncapped OpenRouter key (limit null) without a remaining figure', async () => {
		vi.stubGlobal('fetch', okFetch({ data: { usage: 5, limit: null } }));
		const [or] = await getProviderBudgets();
		expect(or.status).toBe('ok');
		expect(or.usage).toBe(5);
		expect(or.limit).toBeNull();
		expect(or.remaining).toBeUndefined();
	});

	it('flags OpenRouter as unavailable when OPENROUTER_API_KEY is missing', async () => {
		delete env.OPENROUTER_API_KEY;
		vi.stubGlobal('fetch', vi.fn());
		const [or] = await getProviderBudgets();
		expect(or).toMatchObject({ provider: 'openrouter', status: 'unavailable' });
		expect(or.reason).toMatch(/OPENROUTER_API_KEY/);
	});

	it('flags OpenRouter as error on a non-2xx response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: false, status: 403 }))
		);
		const [or] = await getProviderBudgets();
		expect(or).toMatchObject({ provider: 'openrouter', status: 'error' });
		expect(or.reason).toBe('HTTP 403');
	});

	it('catches thrown fetch errors and surfaces them as error status', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('network down');
			})
		);
		const [or] = await getProviderBudgets();
		expect(or).toMatchObject({ provider: 'openrouter', status: 'error', reason: 'network down' });
	});

	it('marks Anthropic unavailable with a clear reason when admin key is absent', async () => {
		vi.stubGlobal('fetch', okFetch({ data: { usage: 0 } }));
		const [, anthropic] = await getProviderBudgets();
		expect(anthropic).toMatchObject({
			provider: 'anthropic',
			status: 'unavailable',
			reason: 'ANTHROPIC_ADMIN_KEY not configured'
		});
	});

	it('marks Anthropic unavailable with a coming-soon reason when admin key is present', async () => {
		env.ANTHROPIC_ADMIN_KEY = 'sk-ant-admin-...';
		vi.stubGlobal('fetch', okFetch({ data: { usage: 0 } }));
		const [, anthropic] = await getProviderBudgets();
		expect(anthropic.reason).toMatch(/coming soon/);
	});

	it('marks OpenAI unavailable with a clear reason when admin key is absent', async () => {
		vi.stubGlobal('fetch', okFetch({ data: { usage: 0 } }));
		const [, , openai] = await getProviderBudgets();
		expect(openai).toMatchObject({
			provider: 'openai',
			status: 'unavailable',
			reason: 'OPENAI_ADMIN_KEY not configured'
		});
	});

	it('always marks Google as unavailable (no public per-key usage API)', async () => {
		vi.stubGlobal('fetch', okFetch({ data: { usage: 0 } }));
		const [, , , google] = await getProviderBudgets();
		expect(google).toMatchObject({ provider: 'google', status: 'unavailable' });
	});

	it('caches a successful fetch inside the 60-second TTL', async () => {
		const fetchMock = okFetch({ data: { usage: 1, limit: 10 } });
		vi.stubGlobal('fetch', fetchMock);
		await getProviderBudgets();
		await getProviderBudgets();
		// One call per cached batch — only OpenRouter actually hits the network.
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('refetches once the 60-second TTL has elapsed', async () => {
		vi.useFakeTimers();
		const fetchMock = okFetch({ data: { usage: 1, limit: 10 } });
		vi.stubGlobal('fetch', fetchMock);
		await getProviderBudgets();
		vi.advanceTimersByTime(61_000);
		await getProviderBudgets();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('bypasses the cache when force is set', async () => {
		const fetchMock = okFetch({ data: { usage: 1, limit: 10 } });
		vi.stubGlobal('fetch', fetchMock);
		await getProviderBudgets();
		await getProviderBudgets({ force: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
