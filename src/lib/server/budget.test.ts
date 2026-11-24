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
									{ amount: '123.4', currency: 'USD' },
									{ amount: '76.6', currency: 'USD' }
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

	it('ignores the regular ANTHROPIC_API_KEY — only the admin key reads the cost API', async () => {
		env.ANTHROPIC_API_KEY = 'sk-ant-api-x';
		const fetchMock = okFetch({ data: { usage: 0 } });
		vi.stubGlobal('fetch', fetchMock);
		const [, anthropic] = await getProviderBudgets();
		expect(anthropic).toMatchObject({
			status: 'unavailable',
			reason: 'ANTHROPIC_ADMIN_KEY not configured'
		});
		expect(fetchMock).toHaveBeenCalledTimes(1); // OpenRouter only
	});

	it('surfaces Anthropic upstream errors with the provider message', async () => {
		env.ANTHROPIC_ADMIN_KEY = 'sk-ant-admin-bad';
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
		expect(anthropic.reason).toBe('HTTP 401: invalid x-api-key');
	});

	it('applies ANTHROPIC_MONTHLY_BUDGET as the bar denominator', async () => {
		env.ANTHROPIC_ADMIN_KEY = 'sk-ant-admin-x';
		env.ANTHROPIC_MONTHLY_BUDGET = '50';
		vi.stubGlobal(
			'fetch',
			routedFetch({
				'https://openrouter.ai': { payload: { data: { usage: 0 } } },
				'https://api.anthropic.com': {
					payload: { data: [{ results: [{ amount: '500' }] }] }
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

	describe('month-to-date window + pagination', () => {
		const NOW = new Date('2026-11-23T15:30:00Z');
		const MONTH_START = '2026-11-01T00:00:00.000Z';

		// Serve a queue of pages for one host and record every request URL.
		function pagedFetch(host: string, pages: unknown[]) {
			const urls: URL[] = [];
			const mock = vi.fn(async (input: string | URL | Request) => {
				const url = new URL(
					typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
				);
				if (!url.href.startsWith(host)) {
					return { ok: true, status: 200, json: async () => ({ data: { usage: 0 } }) } as Response;
				}
				urls.push(url);
				const payload = pages[urls.length - 1];
				if (payload === undefined) throw new Error('requested more pages than served');
				return { ok: true, status: 200, json: async () => payload } as Response;
			});
			return { mock, urls };
		}

		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(NOW);
		});

		it('asks Anthropic for the 1st of the UTC month with the max page size', async () => {
			env.ANTHROPIC_ADMIN_KEY = 'sk-ant-admin-x';
			const { mock, urls } = pagedFetch('https://api.anthropic.com', [
				{ data: [], has_more: false }
			]);
			vi.stubGlobal('fetch', mock);
			const [, anthropic] = await getProviderBudgets();
			expect(urls).toHaveLength(1);
			expect(urls[0].searchParams.get('starting_at')).toBe(MONTH_START);
			expect(urls[0].searchParams.get('ending_at')).toBe(NOW.toISOString());
			expect(urls[0].searchParams.get('bucket_width')).toBe('1d');
			expect(urls[0].searchParams.get('limit')).toBe('31');
			expect(urls[0].searchParams.has('page')).toBe(false);
			expect(anthropic.label).toBe('this month');
		});

		it('follows Anthropic next_page until has_more is false and sums every page', async () => {
			env.ANTHROPIC_ADMIN_KEY = 'sk-ant-admin-x';
			const day = (cents: string) => ({ results: [{ amount: cents, currency: 'USD' }] });
			const { mock, urls } = pagedFetch('https://api.anthropic.com', [
				{ data: [day('100'), day('250')], has_more: true, next_page: 'page_2' },
				{ data: [day('50')], has_more: true, next_page: 'page_3' },
				{ data: [day('100')], has_more: false, next_page: null }
			]);
			vi.stubGlobal('fetch', mock);
			const [, anthropic] = await getProviderBudgets();
			expect(urls.map((u) => u.searchParams.get('page'))).toEqual([null, 'page_2', 'page_3']);
			expect(anthropic.usage).toBeCloseTo(5.0, 5); // 500 cents
		});

		it('stops paging Anthropic at the safety cap if the cursor never ends', async () => {
			env.ANTHROPIC_ADMIN_KEY = 'sk-ant-admin-x';
			const loop = { data: [], has_more: true, next_page: 'again' };
			const { mock, urls } = pagedFetch('https://api.anthropic.com', Array(20).fill(loop));
			vi.stubGlobal('fetch', mock);
			const [, anthropic] = await getProviderBudgets();
			expect(anthropic.status).toBe('ok');
			expect(urls).toHaveLength(5);
		});

		it('asks OpenAI for the 1st of the UTC month in epoch seconds with limit 31', async () => {
			env.OPENAI_ADMIN_KEY = 'sk-admin-x';
			const { mock, urls } = pagedFetch('https://api.openai.com', [{ data: [], has_more: false }]);
			vi.stubGlobal('fetch', mock);
			const [, , openai] = await getProviderBudgets();
			expect(urls[0].searchParams.get('start_time')).toBe(String(Date.parse(MONTH_START) / 1000));
			expect(urls[0].searchParams.get('bucket_width')).toBe('1d');
			expect(urls[0].searchParams.get('limit')).toBe('31');
			expect(openai.label).toBe('this month');
		});

		it('follows OpenAI next_page and sums every page', async () => {
			env.OPENAI_ADMIN_KEY = 'sk-admin-x';
			env.OPENAI_MONTHLY_BUDGET = '10';
			const day = (v: number) => ({ results: [{ amount: { value: v, currency: 'usd' } }] });
			const { mock, urls } = pagedFetch('https://api.openai.com', [
				{ data: [day(1.5), day(2)], has_more: true, next_page: 'cursor_2' },
				{ data: [day(0.5)], has_more: false, next_page: null }
			]);
			vi.stubGlobal('fetch', mock);
			const [, , openai] = await getProviderBudgets();
			expect(urls.map((u) => u.searchParams.get('page'))).toEqual([null, 'cursor_2']);
			expect(openai.usage).toBeCloseTo(4, 5);
			expect(openai.remaining).toBeCloseTo(6, 5);
		});

		it('reports an error when a later page fails', async () => {
			env.OPENAI_ADMIN_KEY = 'sk-admin-x';
			let n = 0;
			vi.stubGlobal(
				'fetch',
				vi.fn(async (input: string | URL | Request) => {
					const href =
						typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
					if (!href.startsWith('https://api.openai.com')) {
						return { ok: true, status: 200, json: async () => ({ data: {} }) } as Response;
					}
					n += 1;
					return n === 1
						? ({
								ok: true,
								status: 200,
								json: async () => ({ data: [], has_more: true, next_page: 'p2' })
							} as Response)
						: ({ ok: false, status: 429, json: async () => ({}) } as Response);
				})
			);
			const [, , openai] = await getProviderBudgets();
			expect(openai).toMatchObject({ status: 'error', reason: 'HTTP 429' });
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
