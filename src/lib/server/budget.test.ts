import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env as _env } from '$env/dynamic/private';
import { getProviderBudgets, _testing } from './budget';

interface MutableEnv {
	OPENROUTER_API_KEY?: string;
	ANTHROPIC_API_KEY?: string;
	ANTHROPIC_ADMIN_KEY?: string;
	OPENAI_ADMIN_KEY?: string;
	ANTHROPIC_MONTHLY_BUDGET?: string;
	OPENAI_MONTHLY_BUDGET?: string;
}

const env = _env as unknown as MutableEnv;

vi.mock('$env/dynamic/private', () => ({ env: {} as MutableEnv }));

function okFetch(payload: unknown) {
	return vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));
}

// Route different upstream URLs to different mock payloads — needed once we
// exercise the live Anthropic/OpenAI shapes alongside OpenRouter in one batch.
function routedFetch(routes: Record<string, { ok?: boolean; status?: number; payload: unknown }>) {
	return vi.fn(async (input: string | URL | Request) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const match = Object.keys(routes).find((prefix) => url.startsWith(prefix));
		if (!match) throw new Error(`unrouted fetch: ${url}`);
		const { ok = true, status = 200, payload } = routes[match];
		return { ok, status, json: async () => payload } as Response;
	});
}

beforeEach(() => {
	_testing.clearCache();
	env.OPENROUTER_API_KEY = 'or-key';
	delete env.ANTHROPIC_API_KEY;
	delete env.ANTHROPIC_ADMIN_KEY;
	delete env.OPENAI_ADMIN_KEY;
	delete env.ANTHROPIC_MONTHLY_BUDGET;
	delete env.OPENAI_MONTHLY_BUDGET;
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	delete env.OPENROUTER_API_KEY;
	delete env.ANTHROPIC_API_KEY;
	delete env.ANTHROPIC_ADMIN_KEY;
	delete env.OPENAI_ADMIN_KEY;
	delete env.ANTHROPIC_MONTHLY_BUDGET;
	delete env.OPENAI_MONTHLY_BUDGET;
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

	it('marks Anthropic unavailable when neither admin nor regular key is set', async () => {
		vi.stubGlobal('fetch', okFetch({ data: { usage: 0 } }));
		const [, anthropic] = await getProviderBudgets();
		expect(anthropic).toMatchObject({
			provider: 'anthropic',
			status: 'unavailable',
			reason: 'ANTHROPIC_ADMIN_KEY not configured'
		});
	});

	it('fetches Anthropic spend from /cost_report and divides cents into dollars', async () => {
		env.ANTHROPIC_ADMIN_KEY = 'sk-ant-admin-x';
		vi.stubGlobal(
			'fetch',
			routedFetch({
				'https://openrouter.ai': { payload: { data: { usage: 0, limit: 10 } } },
				'https://api.anthropic.com': {
					payload: {
						data: [
							{
								results: [
									{ amount: { amount: '123.4', currency: 'USD' } },
									{ amount: { amount: '76.6', currency: 'USD' } }
								]
							}
						]
					}
				}
			})
		);
		const [, anthropic] = await getProviderBudgets();
		expect(anthropic.status).toBe('ok');
		// 123.4 + 76.6 = 200 cents → $2.00
		expect(anthropic.usage).toBeCloseTo(2.0, 5);
	});

	it('falls back to ANTHROPIC_API_KEY when no admin key is set and flags the label', async () => {
		env.ANTHROPIC_API_KEY = 'sk-ant-api-x';
		// Regular keys aren't accepted by /cost_report — surface the upstream error.
		vi.stubGlobal(
			'fetch',
			routedFetch({
				'https://openrouter.ai': { payload: { data: { usage: 0 } } },
				'https://api.anthropic.com': {
					ok: false,
					status: 401,
					payload: { error: { type: 'authentication_error', message: 'invalid x-api-key' } }
				}
			})
		);
		const [, anthropic] = await getProviderBudgets();
		expect(anthropic.status).toBe('error');
		expect(anthropic.reason).toContain('HTTP 401');
		expect(anthropic.reason).toContain('invalid x-api-key');
		expect(anthropic.reason).toContain('tried regular key');
	});

	it('applies ANTHROPIC_MONTHLY_BUDGET as the bar denominator', async () => {
		env.ANTHROPIC_ADMIN_KEY = 'sk-ant-admin-x';
		env.ANTHROPIC_MONTHLY_BUDGET = '50';
		vi.stubGlobal(
			'fetch',
			routedFetch({
				'https://openrouter.ai': { payload: { data: { usage: 0 } } },
				'https://api.anthropic.com': {
					payload: { data: [{ results: [{ amount: { amount: '500' } }] }] }
				}
			})
		);
		const [, anthropic] = await getProviderBudgets();
		expect(anthropic.usage).toBeCloseTo(5.0, 5);
		expect(anthropic.limit).toBe(50);
		expect(anthropic.remaining).toBeCloseTo(45, 5);
	});

	it('marks OpenAI unavailable when admin key is absent', async () => {
		vi.stubGlobal('fetch', okFetch({ data: { usage: 0 } }));
		const [, , openai] = await getProviderBudgets();
		expect(openai).toMatchObject({
			provider: 'openai',
			status: 'unavailable',
			reason: 'OPENAI_ADMIN_KEY not configured'
		});
	});

	it('fetches OpenAI spend from /organization/costs and sums every result line', async () => {
		env.OPENAI_ADMIN_KEY = 'sk-admin-x';
		vi.stubGlobal(
			'fetch',
			routedFetch({
				'https://openrouter.ai': { payload: { data: { usage: 0 } } },
				'https://api.openai.com': {
					payload: {
						data: [
							{
								results: [
									{ amount: { value: 0.42, currency: 'usd' } },
									{ amount: { value: 0.13, currency: 'usd' } }
								]
							}
						]
					}
				}
			})
		);
		const [, , openai] = await getProviderBudgets();
		expect(openai.status).toBe('ok');
		expect(openai.usage).toBeCloseTo(0.55, 5);
	});

	it('surfaces OpenAI upstream errors verbatim (e.g. invalid key)', async () => {
		env.OPENAI_ADMIN_KEY = 'sk-admin-bad';
		vi.stubGlobal(
			'fetch',
			routedFetch({
				'https://openrouter.ai': { payload: { data: { usage: 0 } } },
				'https://api.openai.com': {
					ok: false,
					status: 401,
					payload: { error: { message: 'Incorrect API key provided' } }
				}
			})
		);
		const [, , openai] = await getProviderBudgets();
		expect(openai.status).toBe('error');
		expect(openai.reason).toContain('HTTP 401');
		expect(openai.reason).toContain('Incorrect API key provided');
	});

	it('applies OPENAI_MONTHLY_BUDGET as the bar denominator', async () => {
		env.OPENAI_ADMIN_KEY = 'sk-admin-x';
		env.OPENAI_MONTHLY_BUDGET = '25';
		vi.stubGlobal(
			'fetch',
			routedFetch({
				'https://openrouter.ai': { payload: { data: { usage: 0 } } },
				'https://api.openai.com': {
					payload: { data: [{ results: [{ amount: { value: 2 } }] }] }
				}
			})
		);
		const [, , openai] = await getProviderBudgets();
		expect(openai.usage).toBe(2);
		expect(openai.limit).toBe(25);
		expect(openai.remaining).toBe(23);
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
