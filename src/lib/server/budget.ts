// Provider budget readout — per-paid-provider spend + remaining credit.
//
// OpenRouter is the only provider whose regular API key can read its own
// usage, via GET /api/v1/key. Anthropic and OpenAI both expose usage data
// only through admin/organization endpoints that need a separate admin key
// (ANTHROPIC_ADMIN_KEY / OPENAI_ADMIN_KEY in env). Google AI Studio has no
// public per-key usage endpoint — Vertex billing needs a Cloud service
// account. So this module gracefully degrades: live data where we can,
// "unavailable" with a clear reason where we can't.

import { env } from '$env/dynamic/private';

export type ProviderName = 'openrouter' | 'anthropic' | 'openai' | 'google';
export type BudgetStatus = 'ok' | 'unavailable' | 'error';

export interface ProviderBudget {
	provider: ProviderName;
	status: BudgetStatus;
	/** Human label for the credit source (e.g. OpenRouter key label). */
	label?: string;
	/** Current spend in USD. */
	usage?: number;
	/** Credit limit in USD; null means uncapped (pay-as-you-go). */
	limit?: number | null;
	/** limit - usage, when both are known. */
	remaining?: number;
	/** OpenRouter: the key itself is a free-tier key. */
	isFreeKey?: boolean;
	/** When status !== 'ok', a one-line explanation for the UI. */
	reason?: string;
}

interface OpenRouterKeyResponse {
	data?: {
		label?: string;
		usage?: number;
		limit?: number | null;
		limit_remaining?: number | null;
		is_free_tier?: boolean;
	};
}

const PROVIDERS: readonly ProviderName[] = ['openrouter', 'anthropic', 'openai', 'google'];
const CACHE_TTL = 60_000;

let cached: ProviderBudget[] | null = null;
let cachedAt = 0;

export async function getProviderBudgets(options?: { force?: boolean }): Promise<ProviderBudget[]> {
	const now = Date.now();
	if (!options?.force && cached && now - cachedAt < CACHE_TTL) {
		return cached;
	}

	const results = await Promise.all(
		PROVIDERS.map(async (provider) => {
			try {
				return await fetchOne(provider);
			} catch (err) {
				return {
					provider,
					status: 'error' as const,
					reason: err instanceof Error ? err.message : 'Unknown error'
				};
			}
		})
	);

	cached = results;
	cachedAt = now;
	return results;
}

function fetchOne(provider: ProviderName): Promise<ProviderBudget> {
	switch (provider) {
		case 'openrouter':
			return fetchOpenRouterBudget();
		case 'anthropic':
			return fetchAnthropicBudget();
		case 'openai':
			return fetchOpenAIBudget();
		case 'google':
			return fetchGoogleBudget();
	}
}

async function fetchOpenRouterBudget(): Promise<ProviderBudget> {
	const key = env.OPENROUTER_API_KEY;
	if (!key) {
		return {
			provider: 'openrouter',
			status: 'unavailable',
			reason: 'OPENROUTER_API_KEY not configured'
		};
	}

	const res = await fetch('https://openrouter.ai/api/v1/key', {
		headers: { Authorization: `Bearer ${key}` }
	});
	if (!res.ok) {
		return {
			provider: 'openrouter',
			status: 'error',
			reason: `HTTP ${res.status}`
		};
	}

	const body = (await res.json()) as OpenRouterKeyResponse;
	const data = body.data ?? {};
	const usage = typeof data.usage === 'number' ? data.usage : undefined;
	const limit = data.limit ?? null;
	const remaining =
		typeof data.limit_remaining === 'number'
			? data.limit_remaining
			: typeof limit === 'number' && typeof usage === 'number'
				? Math.max(0, limit - usage)
				: undefined;

	return {
		provider: 'openrouter',
		status: 'ok',
		label: data.label,
		usage,
		limit,
		remaining,
		isFreeKey: data.is_free_tier
	};
}

// Parse a USD monthly-budget env var into a positive number (or null when
// unset/invalid). Used by both admin fetchers to give the UI bar a denominator.
function parseMonthlyBudget(value: string | undefined): number | null {
	if (!value) return null;
	const n = parseFloat(value);
	return Number.isFinite(n) && n > 0 ? n : null;
}

// UTC window covering "today so far" — a single 1d bucket per provider.
function todayUTCWindow(): { startSec: number; startISO: string; endISO: string } {
	const now = new Date();
	const startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	return {
		startSec: Math.floor(startMs / 1000),
		startISO: new Date(startMs).toISOString(),
		endISO: now.toISOString()
	};
}

// Best-effort upstream-error extraction: surface the provider's own message
// (e.g. "invalid_api_key") so the user can act on it, instead of a bare HTTP code.
async function readErrorMessage(res: Response): Promise<string> {
	let msg = `HTTP ${res.status}`;
	try {
		const body = (await res.json()) as { error?: { message?: string } | string };
		const inner =
			typeof body?.error === 'object' && body.error
				? body.error.message
				: typeof body?.error === 'string'
					? body.error
					: undefined;
		if (inner) msg = `${msg}: ${inner}`;
	} catch {
		// non-JSON body — keep the bare status
	}
	return msg;
}

// Anthropic Cost API: GET /v1/organizations/cost_report with x-api-key + the
// anthropic-version header. Only admin keys (sk-ant-admin…) are accepted by
// the upstream; we still attempt the call with the regular ANTHROPIC_API_KEY
// as a fallback so the user sees the real failure (invalid_api_key) rather
// than us guessing in advance. Per Anthropic's docs, cost values are USD
// reported as decimal strings "in lowest units (cents)" — we sum and divide.
async function fetchAnthropicBudget(): Promise<ProviderBudget> {
	const adminKey = env.ANTHROPIC_ADMIN_KEY;
	const fallbackKey = env.ANTHROPIC_API_KEY;
	const key = adminKey ?? fallbackKey;
	const usingFallback = !adminKey && !!fallbackKey;

	if (!key) {
		return {
			provider: 'anthropic',
			status: 'unavailable',
			reason: 'ANTHROPIC_ADMIN_KEY not configured'
		};
	}

	const { startISO, endISO } = todayUTCWindow();
	const url = new URL('https://api.anthropic.com/v1/organizations/cost_report');
	url.searchParams.set('starting_at', startISO);
	url.searchParams.set('ending_at', endISO);
	url.searchParams.set('bucket_width', '1d');

	const res = await fetch(url, {
		headers: {
			'x-api-key': key,
			'anthropic-version': '2023-06-01'
		}
	});

	if (!res.ok) {
		const upstream = await readErrorMessage(res);
		return {
			provider: 'anthropic',
			status: 'error',
			reason: usingFallback ? `${upstream} (tried regular key — admin key not set)` : upstream
		};
	}

	const body = (await res.json()) as {
		data?: Array<{ results?: Array<{ amount?: { amount?: string; currency?: string } }> }>;
	};

	// Sum across every bucket × every result entry. Defensive: amounts can be
	// strings or numbers depending on the response variant.
	let cents = 0;
	for (const bucket of body.data ?? []) {
		for (const result of bucket.results ?? []) {
			const raw = result.amount?.amount;
			const n = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : 0;
			if (Number.isFinite(n)) cents += n;
		}
	}
	const usage = cents / 100;
	const limit = parseMonthlyBudget(env.ANTHROPIC_MONTHLY_BUDGET);
	return {
		provider: 'anthropic',
		status: 'ok',
		label: usingFallback ? 'today (via regular key)' : 'today',
		usage,
		limit,
		remaining: limit !== null ? Math.max(0, limit - usage) : undefined
	};
}

// OpenAI Costs API: GET /v1/organization/costs with a Bearer admin key. One
// `1d` bucket since midnight UTC → today's spend, summed across every result
// entry (each entry is one line item under that bucket).
async function fetchOpenAIBudget(): Promise<ProviderBudget> {
	const key = env.OPENAI_ADMIN_KEY;
	if (!key) {
		return {
			provider: 'openai',
			status: 'unavailable',
			reason: 'OPENAI_ADMIN_KEY not configured'
		};
	}

	const { startSec } = todayUTCWindow();
	const url = new URL('https://api.openai.com/v1/organization/costs');
	url.searchParams.set('start_time', String(startSec));
	url.searchParams.set('bucket_width', '1d');
	url.searchParams.set('limit', '1');

	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${key}` }
	});

	if (!res.ok) {
		return { provider: 'openai', status: 'error', reason: await readErrorMessage(res) };
	}

	// Top-level shape is the standard OpenAI page wrapper `{data: [bucket]}`,
	// but cookbook examples sometimes show a single bucket directly — accept both.
	const body = (await res.json()) as
		| { data?: Array<{ results?: Array<{ amount?: { value?: number } }> }> }
		| { results?: Array<{ amount?: { value?: number } }> };
	const buckets = 'data' in body && body.data ? body.data : [body as { results?: unknown[] }];
	let usage = 0;
	for (const bucket of buckets) {
		const results = (bucket as { results?: Array<{ amount?: { value?: number } }> }).results ?? [];
		for (const result of results) {
			const v = result.amount?.value;
			if (typeof v === 'number' && Number.isFinite(v)) usage += v;
		}
	}

	const limit = parseMonthlyBudget(env.OPENAI_MONTHLY_BUDGET);
	return {
		provider: 'openai',
		status: 'ok',
		label: 'today',
		usage,
		limit,
		remaining: limit !== null ? Math.max(0, limit - usage) : undefined
	};
}

// Google AI Studio doesn't expose per-key usage. Vertex AI has usage data
// only through Cloud Billing, which needs a service account with the
// roles/billing.viewer role — out of scope for a single env var.
async function fetchGoogleBudget(): Promise<ProviderBudget> {
	return {
		provider: 'google',
		status: 'unavailable',
		reason: 'no public usage API'
	};
}

export const _testing = {
	clearCache: () => {
		cached = null;
		cachedAt = 0;
	}
};
