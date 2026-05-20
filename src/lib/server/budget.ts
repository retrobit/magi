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

// Anthropic's Admin API (`/v1/organizations/cost_report`) requires an
// organization admin key (sk-ant-admin-…), which is a separate credential
// from the regular message-sending key. Wire-up of the cost-report fetch
// itself is a future step; for now we only signal whether the env var is
// configured so the UI can guide the user.
async function fetchAnthropicBudget(): Promise<ProviderBudget> {
	if (!env.ANTHROPIC_ADMIN_KEY) {
		return {
			provider: 'anthropic',
			status: 'unavailable',
			reason: 'ANTHROPIC_ADMIN_KEY not configured'
		};
	}
	return {
		provider: 'anthropic',
		status: 'unavailable',
		reason: 'admin API integration coming soon'
	};
}

// OpenAI mirrors Anthropic — usage lives behind an admin key
// (OPENAI_ADMIN_KEY) at `/v1/organization/usage/...`, distinct from the
// regular API key. Same shape, same placeholder for now.
async function fetchOpenAIBudget(): Promise<ProviderBudget> {
	if (!env.OPENAI_ADMIN_KEY) {
		return {
			provider: 'openai',
			status: 'unavailable',
			reason: 'OPENAI_ADMIN_KEY not configured'
		};
	}
	return {
		provider: 'openai',
		status: 'unavailable',
		reason: 'admin API integration coming soon'
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
