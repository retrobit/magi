import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { getProviderBudgets } from '$lib/server/budget';
import { checkApiKey } from '$lib/server/auth';
import { logEvent } from '$lib/server/logger';

export const GET: RequestHandler = async ({ request, url, getClientAddress }) => {
	const requestId = crypto.randomUUID().slice(0, 8);

	// This endpoint returns the operator's real provider spend, credit limits, and
	// tier — billing telemetry that must never be public. `checkApiKey` passes
	// through when MAGI_API_KEY is unset (the dev-friendly default), so in a
	// production build we additionally fail CLOSED unless a key is configured.
	// Inference (POST /api/magi) is intentionally left open for the free-tier demo;
	// only this billing route is locked. Dev stays pass-through for convenience.
	if (!dev && !env.MAGI_API_KEY) {
		logEvent('warn', 'budget.locked', { requestId, ip: getClientAddress() });
		return json(
			{ error: 'Budget endpoint disabled. Set MAGI_API_KEY to enable it.' },
			{ status: 404, headers: { 'X-Request-Id': requestId } }
		);
	}

	const authFail = checkApiKey(request);
	if (authFail) {
		logEvent('warn', 'budget.unauthorized', { requestId, ip: getClientAddress() });
		return authFail;
	}

	const force = url.searchParams.get('force') === '1';

	try {
		const providers = await getProviderBudgets({ force });
		return json(
			{ providers },
			{
				headers: {
					// Match the server-side TTL (60s) so a refresh on the client
					// after a stale interval lines up with an actual upstream fetch.
					'Cache-Control': 'private, max-age=60',
					'X-Request-Id': requestId
				}
			}
		);
	} catch (err) {
		logEvent('error', 'budget.fetch_failed', {
			requestId,
			error: err instanceof Error ? err.message : String(err)
		});
		return json(
			{ error: 'Failed to fetch provider budgets' },
			{ status: 500, headers: { 'X-Request-Id': requestId } }
		);
	}
};
