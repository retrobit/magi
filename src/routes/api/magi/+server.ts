import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { streamText } from 'ai';
import { getModel } from '$lib/magi/models';
import { getStrategy, type ConsensusContext } from '$lib/magi/consensus';
import {
	TIER_CONFIGS,
	DEFAULT_MAGI_CONFIG,
	FREE_MAGI_CONFIG,
	validateConfig,
	type MagiConfig
} from '$lib/magi/config';
import type { MagiResponse } from '$lib/magi/types';
import { NODE_TEMPERAMENTS } from '$lib/magi/types';
import { magiRequestSchema } from '$lib/magi/validation';
import { TEMPERAMENT_SYSTEM_PROMPTS } from '$lib/magi/temperaments';
import { findModelEntry } from '$lib/magi/registry';
import { env } from '$env/dynamic/private';
import { isRateLimited } from '$lib/server/rate-limit';
import { timingSafeEqual } from 'node:crypto';

// Validate hardcoded configs once at module load
validateConfig(DEFAULT_MAGI_CONFIG);
validateConfig(FREE_MAGI_CONFIG);

function extractErrorMessage(err: unknown): string {
	// AI SDK wraps upstream errors — dig into responseBody for the real message
	const apiErr = err as { responseBody?: string; message?: string };
	if (apiErr.responseBody) {
		try {
			const body = JSON.parse(apiErr.responseBody);
			const raw = body?.error?.metadata?.raw;
			if (raw) {
				try {
					return JSON.parse(raw).error ?? raw;
				} catch {
					return raw;
				}
			}
			if (body?.error?.message) return body.error.message;
		} catch {
			// fall through
		}
	}
	// RetryError — dig into the last error
	const retryErr = err as { lastError?: unknown };
	if (retryErr.lastError) return extractErrorMessage(retryErr.lastError);
	if (err instanceof Error) return err.message;
	return 'Unknown error';
}

function log(message: string, level: 'info' | 'error' = 'info') {
	const ts = new Date().toISOString().slice(11, 23);
	const prefix = `[MAGI ${ts}]`;
	if (level === 'error') {
		console.error(prefix, message);
	} else {
		console.log(prefix, message);
	}
}

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
		consensusNode: requestedConsensusNode,
		assignments: clientAssignments,
		temperaments: useTemperaments
	} = parsed.data;

	log(`request: tier=${tier} strategy=${strategyName} temperaments=${useTemperaments ?? false}`);

	// Use client assignments if provided, otherwise fall back to tier preset
	let config: MagiConfig;
	if (clientAssignments) {
		config = clientAssignments as MagiConfig;
		try {
			validateConfig(config);
		} catch (err) {
			return json(
				{
					error: `Invalid assignments: ${err instanceof Error ? err.message : 'validation failed'}`
				},
				{ status: 400 }
			);
		}
		// Verify all models exist in the registry for the requested tier
		for (const a of config) {
			const entry = findModelEntry(a.gateway, a.modelId, tier);
			if (!entry) {
				const exists = findModelEntry(a.gateway, a.modelId);
				return json(
					{
						error: exists
							? `Model "${a.modelId}" is not available in the "${tier}" tier`
							: `Unknown model "${a.modelId}" for gateway "${a.gateway}"`
					},
					{ status: 400 }
				);
			}
		}
	} else {
		config = TIER_CONFIGS[tier];
	}

	// Resolve consensus node — default to first node
	const consensusNodeIndex = requestedConsensusNode
		? config.findIndex((a) => a.node === requestedConsensusNode)
		: 0;

	if (consensusNodeIndex === -1) {
		return json(
			{ error: `Invalid consensusNode: "${requestedConsensusNode}" is not in the current config` },
			{ status: 400 }
		);
	}

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
				// Send node configuration so the client knows assignments
				send('config', config);

				// Phase 1: Dispatch to all three MAGI nodes in parallel (streaming)
				log(`dispatching to nodes: ${config.map((c) => `${c.node}/${c.modelId}`).join(', ')}`);
				const results = await Promise.allSettled(
					config.map(async ({ node, gateway, provider, modelId }) => {
						try {
							const model = getModel(gateway, modelId);
							const systemPrompt = useTemperaments
								? TEMPERAMENT_SYSTEM_PROMPTS[NODE_TEMPERAMENTS[node]]
								: undefined;
							log(`${node} starting (${modelId})`);
							const result = streamText({
								model,
								...(systemPrompt && { system: systemPrompt }),
								prompt: query,
	
								abortSignal: abortController.signal
							});
							let fullText = '';
							for await (const chunk of result.textStream) {
								fullText += chunk;
								send('model-chunk', { node, text: chunk });
							}
							log(`${node} complete (${fullText.length} chars)`);
							const response: MagiResponse = { node, gateway, provider, text: fullText };
							send('model-response', response);
							return response;
						} catch (err) {
							const message = extractErrorMessage(err);
							log(`${node} failed: ${message}`, 'error');
							send('model-error', { node, gateway, provider, error: message });
							throw err;
						}
					})
				);

				const responses: MagiResponse[] = results
					.filter((r): r is PromiseFulfilledResult<MagiResponse> => r.status === 'fulfilled')
					.map((r) => r.value);

				log(`phase 1 complete: ${responses.length}/${config.length} models responded`);

				if (responses.length === 0) {
					log('all models failed — aborting', 'error');
					send('error', { message: 'All three models failed to respond' });
					close();
					return;
				}

				if (responses.length < config.length) {
					log(`partial consensus: ${responses.length}/${config.length}`);
					send('partial-consensus', {
						responded: responses.length,
						total: config.length
					});
				}

				// Phase 2: Stream consensus synthesis
				log(`consensus starting (${strategyName} via ${config[consensusNodeIndex].node})`);
				const consensusStrategy = getStrategy(strategyName);
				const ctx: ConsensusContext = {
					responses,
					query,
					getModel,
					nodeAssignments: config,
					consensusNodeIndex,
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
