import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateText } from 'ai';
import { getModel } from '$lib/magi/models';
import { getStrategy, type ConsensusContext } from '$lib/magi/consensus';
import { DEFAULT_MAGI_CONFIG, DEFAULT_CONSENSUS_PROVIDER, validateConfig } from '$lib/magi/config';
import type { MagiResponse } from '$lib/magi/types';
import { magiRequestSchema } from '$lib/magi/validation';
import { env } from '$env/dynamic/private';
import { isRateLimited } from '$lib/server/rate-limit';
import { timingSafeEqual } from 'node:crypto';

// Validate the hardcoded config once at module load
validateConfig(DEFAULT_MAGI_CONFIG);

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	// API key auth (opt-in: enforced when MAGI_API_KEY is set in env)
	if (env.MAGI_API_KEY) {
		const authHeader = request.headers.get('authorization');
		const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
		if (!token || !safeCompare(token, env.MAGI_API_KEY)) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
	}

	// Rate limiting (sliding window per IP)
	if (isRateLimited(getClientAddress())) {
		return json({ error: 'Too many requests' }, { status: 429 });
	}

	// Content-Type validation
	if (!request.headers.get('content-type')?.includes('application/json')) {
		return json({ error: 'Content-Type must be application/json' }, { status: 415 });
	}

	const body = await request.json().catch((err: unknown) => {
		console.error('[MAGI] Failed to parse request body:', err);
		return null;
	});
	if (!body) {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const parsed = magiRequestSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: 'Invalid request', details: parsed.error.issues.map((i) => i.message) },
			{ status: 400 }
		);
	}

	const {
		query,
		tier,
		strategy: strategyName,
		consensusProvider = DEFAULT_CONSENSUS_PROVIDER
	} = parsed.data;
	const config = DEFAULT_MAGI_CONFIG;

	const abortController = new AbortController();
	request.signal.addEventListener('abort', () => abortController.abort(), { once: true });

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			let closed = false;

			function send(event: string, data: unknown) {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					closed = true;
				}
			}

			function close() {
				if (closed) return;
				closed = true;
				controller.close();
			}

			try {
				// Send node configuration so the client knows provider assignments
				send('config', config);

				// Phase 1: Dispatch to all three MAGI nodes in parallel
				const results = await Promise.allSettled(
					config.map(async ({ node, provider }) => {
						const model = getModel(provider, tier);
						const result = await generateText({
							model,
							prompt: query,
							abortSignal: abortController.signal
						});
						const response: MagiResponse = { node, provider, text: result.text };
						send('model-response', response);
						return response;
					})
				);

				const responses: MagiResponse[] = [];
				for (const [i, result] of results.entries()) {
					if (result.status === 'fulfilled') {
						responses.push(result.value);
					} else {
						send('model-error', {
							node: config[i].node,
							provider: config[i].provider,
							error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
						});
					}
				}

				if (responses.length === 0) {
					send('error', { message: 'All three models failed to respond' });
					close();
					return;
				}

				if (responses.length < config.length) {
					send('partial-consensus', {
						responded: responses.length,
						total: config.length
					});
				}

				// Phase 2: Stream consensus synthesis
				const consensusStrategy = getStrategy(strategyName);
				const ctx: ConsensusContext = {
					responses,
					query,
					getModel,
					tier,
					consensusProvider,
					signal: abortController.signal
				};

				for await (const event of consensusStrategy.execute(ctx)) {
					switch (event.type) {
						case 'text-delta':
							send('consensus-chunk', { text: event.text });
							break;
						case 'complete':
							send('consensus-complete', { text: event.fullText });
							break;
					}
				}
			} catch (err) {
				send('error', {
					message: err instanceof Error ? err.message : 'Internal server error'
				});
			}

			close();
		},
		cancel() {
			abortController.abort();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache'
		}
	});
};

function safeCompare(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		timingSafeEqual(bufA, bufA);
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}
