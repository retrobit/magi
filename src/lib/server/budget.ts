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
import { logEvent } from './logger';
import type { GatewayName, ProviderBudget } from '$lib/magi/types';

interface OpenRouterKeyResponse {
	data?: {
		label?: string;
		usage?: number;
		limit?: number | null;
		limit_remaining?: number | null;
		is_free_tier?: boolean;
	};
}

const CACHE_TTL = 60_000;
// Both admin cost APIs return one bucket per day; a UTC month never has more than 31.
const MAX_MONTH_BUCKETS = 31;
// Safety stop for the page loop — a month fits in a single page at the limit above,
// so more than this means the upstream is misbehaving, not that there is more data.
const MAX_PAGES = 5;

// Display order — OpenRouter first, unlike GATEWAY_NAMES (object keys keep insertion order).
const FETCHERS: Record<GatewayName, () => Promise<ProviderBudget>> = {
	openrouter: fetchOpenRouterBudget,
	anthropic: fetchAnthropicBudget,
	openai: fetchOpenAIBudget,
	// Google AI Studio exposes no per-key usage. Vertex AI has usage only through
	// Cloud Billing, which needs a service account with roles/billing.viewer — out
	// of scope for a single env var.
	google: async () => ({
		provider: 'google',
		status: 'unavailable',
		reason: 'no public usage API'
	})
};

let cached: ProviderBudget[] | null = null;
let cachedAt = 0;

export async function getProviderBudgets(options?: { force?: boolean }): Promise<ProviderBudget[]> {
	const now = Date.now();
	if (!options?.force && cached && now - cachedAt < CACHE_TTL) {
		return cached;
	}

	const results = await Promise.all(
		(Object.keys(FETCHERS) as GatewayName[]).map(async (provider) => {
			try {
				return await FETCHERS[provider]();
			} catch (err) {
				const reason = err instanceof Error ? err.message : 'Unknown error';
				// The error already surfaces to the UI via `status: 'error'`, but
				// the server side needs its own breadcrumb — a misbehaving admin
				// key is otherwise invisible to whoever runs the deployment.
				logEvent('warn', 'budget.provider_failed', { provider, error: reason });
				return {
					provider,
					status: 'error' as const,
					reason
				};
			}
		})
	);

	cached = results;
	cachedAt = now;
	return results;
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
		headers: { Authorization: `Bearer ${key}` },
		// One hung provider would otherwise pin GET /api/magi/budget until the
		// platform's function cap; the TimeoutError lands in the per-provider catch.
		signal: AbortSignal.timeout(10_000)
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

// Month-to-date spend plus the optional *_MONTHLY_BUDGET env var (USD, positive) as
// the bar denominator — the window and the denominator are both monthly.
function monthToDate(
	provider: GatewayName,
	usage: number,
	budgetEnv: string | undefined
): ProviderBudget {
	const n = budgetEnv ? parseFloat(budgetEnv) : NaN;
	const limit = Number.isFinite(n) && n > 0 ? n : null;
	return {
		provider,
		status: 'ok',
		label: 'this month',
		usage,
		limit,
		remaining: limit !== null ? Math.max(0, limit - usage) : undefined
	};
}

// First instant of the current UTC month — start of the month-to-date window.
function monthStartUTC(): Date {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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

// Anthropic Cost API: GET /v1/organizations/cost_report, admin key (sk-ant-admin…)
// in x-api-key. Month-to-date in 1d buckets: `limit` defaults to 7 and maxes at 31,
// and a response with `has_more` carries a `next_page` cursor to pass as `page`.
// Cost amounts are USD decimal strings in lowest units (cents).
// https://docs.anthropic.com/en/api/admin-api/usage-cost/get-cost-report
async function fetchAnthropicBudget(): Promise<ProviderBudget> {
	const key = env.ANTHROPIC_ADMIN_KEY;
	if (!key) {
		return {
			provider: 'anthropic',
			status: 'unavailable',
			reason: 'ANTHROPIC_ADMIN_KEY not configured'
		};
	}

	let cents = 0;
	let page: string | undefined;
	for (let i = 0; i < MAX_PAGES; i += 1) {
		const url = new URL('https://api.anthropic.com/v1/organizations/cost_report');
		url.searchParams.set('starting_at', monthStartUTC().toISOString());
		url.searchParams.set('ending_at', new Date().toISOString());
		url.searchParams.set('bucket_width', '1d');
		url.searchParams.set('limit', String(MAX_MONTH_BUCKETS));
		if (page) url.searchParams.set('page', page);

		const res = await fetch(url, {
			headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) {
			return { provider: 'anthropic', status: 'error', reason: await readErrorMessage(res) };
		}

		const body = (await res.json()) as {
			data?: Array<{ results?: Array<{ amount?: string }> }>;
			has_more?: boolean;
			next_page?: string | null;
		};
		for (const bucket of body.data ?? []) {
			for (const result of bucket.results ?? []) {
				const n = Number(result.amount);
				if (Number.isFinite(n)) cents += n;
			}
		}
		if (!body.has_more || !body.next_page) break;
		page = body.next_page;
	}
	return monthToDate('anthropic', cents / 100, env.ANTHROPIC_MONTHLY_BUDGET);
}

// OpenAI Costs API: GET /v1/organization/costs, Bearer admin key. Month-to-date in
// 1d buckets (the only width): `limit` defaults to 7 and ranges 1–180, and `page`
// takes the previous response's `next_page`. Each bucket's results are line items.
// https://platform.openai.com/docs/api-reference/usage/costs
async function fetchOpenAIBudget(): Promise<ProviderBudget> {
	const key = env.OPENAI_ADMIN_KEY;
	if (!key) {
		return {
			provider: 'openai',
			status: 'unavailable',
			reason: 'OPENAI_ADMIN_KEY not configured'
		};
	}

	let usage = 0;
	let page: string | undefined;
	for (let i = 0; i < MAX_PAGES; i += 1) {
		const url = new URL('https://api.openai.com/v1/organization/costs');
		url.searchParams.set('start_time', String(Math.floor(monthStartUTC().getTime() / 1000)));
		url.searchParams.set('bucket_width', '1d');
		url.searchParams.set('limit', String(MAX_MONTH_BUCKETS));
		if (page) url.searchParams.set('page', page);

		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) {
			return { provider: 'openai', status: 'error', reason: await readErrorMessage(res) };
		}

		const body = (await res.json()) as {
			data?: Array<{ results?: Array<{ amount?: { value?: number } }> }>;
			has_more?: boolean;
			next_page?: string | null;
		};
		for (const bucket of body.data ?? []) {
			for (const result of bucket.results ?? []) {
				const v = result.amount?.value;
				if (typeof v === 'number' && Number.isFinite(v)) usage += v;
			}
		}
		if (!body.has_more || !body.next_page) break;
		page = body.next_page;
	}
	return monthToDate('openai', usage, env.OPENAI_MONTHLY_BUDGET);
}

export const _testing = {
	clearCache: () => {
		cached = null;
		cachedAt = 0;
	}
};
