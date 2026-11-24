import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { TierName, AvailableModel } from '$lib/magi/types';
import { TIER_NAMES } from '$lib/magi/types';
import { getModelsForTier } from '$lib/magi/registry';
import { getOpenRouterFreeModels } from '$lib/server/openrouter';
import { isModelHealthy } from '$lib/server/health';
import { logEvent } from '$lib/server/logger';

export const GET: RequestHandler = async ({ url }) => {
	const tier = url.searchParams.get('tier') as TierName | null;

	if (!tier || !(TIER_NAMES as readonly string[]).includes(tier)) {
		logEvent('warn', 'models.invalid_tier', { tier: tier ?? '(missing)' });
		return json(
			{ error: `Invalid tier — must be one of: ${TIER_NAMES.join(', ')}` },
			{ status: 400 }
		);
	}

	let models: AvailableModel[];
	let headers: Record<string, string> = {};

	if (tier === 'free') {
		const orModels = await getOpenRouterFreeModels();
		models = orModels.filter((m) => isModelHealthy(m.id));
		// Let the CDN absorb repeat visits — but never an empty list: that is what a
		// failed catalog fetch looks like, and it would be served to everyone.
		if (models.length > 0) {
			headers = { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' };
		}
	} else {
		models = getModelsForTier(tier).map((m) => ({
			id: m.id,
			gateway: m.gateway,
			provider: m.provider,
			displayName: m.displayName
		}));
	}

	return json({ models }, { headers });
};
