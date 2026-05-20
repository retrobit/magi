import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProviderBudgets } from '$lib/server/budget';
import { checkApiKey } from '$lib/server/auth';
import { logEvent } from '$lib/server/logger';

export const GET: RequestHandler = async ({ request, url }) => {
	const authFail = checkApiKey(request);
	if (authFail) return authFail;

	const force = url.searchParams.get('force') === '1';

	try {
		const providers = await getProviderBudgets({ force });
		return json(
			{ providers },
			{
				headers: {
					// Match the server-side TTL (60s) so a refresh on the client
					// after a stale interval lines up with an actual upstream fetch.
					'Cache-Control': 'private, max-age=60'
				}
			}
		);
	} catch (err) {
		logEvent('error', 'budget.fetch_failed', {
			error: err instanceof Error ? err.message : String(err)
		});
		return json({ error: 'Failed to fetch provider budgets' }, { status: 500 });
	}
};
