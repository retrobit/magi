import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { streamText, type ModelMessage } from 'ai';
import { getModel } from '$lib/magi/models';
import { getStrategy, type ConsensusContext } from '$lib/magi/consensus';
import {
	TIER_CONFIGS,
	DEFAULT_MAGI_CONFIG,
	FREE_MAGI_CONFIG,
	validateConfig,
	buildDiverseConfig,
	type MagiConfig
} from '$lib/magi/config';
import type { MagiResponse, MagiNodeName } from '$lib/magi/types';
import { NODE_TEMPERAMENTS } from '$lib/magi/types';
import { magiRequestSchema, type HistoryTurn } from '$lib/magi/validation';
import {
	encodeStreamEvent,
	type StreamEventName,
	type StreamEventPayloads
} from '$lib/magi/stream-events';
import { TEMPERAMENT_SYSTEM_PROMPTS } from '$lib/magi/temperaments';
import { findModelEntry } from '$lib/magi/registry';
import { env } from '$env/dynamic/private';
import { isRateLimited } from '$lib/server/rate-limit';
import { markUnhealthy, isModelHealthy, getHealthStatus } from '$lib/server/health';
import { getOpenRouterFreeModels } from '$lib/server/openrouter';
import { markCacheBreakpoint } from '$lib/magi/prompt-cache';
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

// Replay a node's own past turns as an alternating user/assistant message list.
// "Own thread only" — a node never sees the other nodes or the consensus. Turns
// the node didn't answer (errored) are skipped so the alternation stays valid.
function buildNodeMessages(
	node: MagiNodeName,
	history: HistoryTurn[],
	currentQuery: string
): ModelMessage[] {
	const messages: ModelMessage[] = [];
	for (const turn of history) {
		const own = turn.nodeResponses.find((r) => r.node === node);
		if (!own) continue;
		messages.push({ role: 'user', content: turn.query });
		messages.push({ role: 'assistant', content: own.text });
	}
	messages.push({ role: 'user', content: currentQuery });
	return messages;
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
		temperaments: useTemperaments,
		consensusTemperament: useConsensusTemperament,
		temperamentAwareness: useAwareness,
		genericLabels: useGenericLabels,
		history = []
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
		// Validate models against static registry (direct APIs only; OpenRouter is checked at dispatch)
		for (const a of config) {
			if (a.gateway === 'openrouter') {
				// Validated by pre-flight health check before dispatch
			} else {
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
		}
	} else if (tier === 'free') {
		// Resolve free tier dynamically from OpenRouter
		const orModels = await getOpenRouterFreeModels();
		config =
			orModels.length >= 3
				? (buildDiverseConfig(orModels) as unknown as MagiConfig)
				: FREE_MAGI_CONFIG;
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

			function send<E extends StreamEventName>(event: E, data: StreamEventPayloads[E]) {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(encodeStreamEvent(event, data)));
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

				// Pre-flight health check — catch unhealthy models before burning tokens
				const orModels = config.some((a) => a.gateway === 'openrouter')
					? await getOpenRouterFreeModels()
					: [];
				const nodeHealth = config.map(({ node, gateway, provider, modelId }) => {
					if (!isModelHealthy(modelId)) {
						const entry = getHealthStatus(modelId);
						return {
							node,
							gateway,
							provider,
							modelId,
							healthy: false,
							reason: entry?.lastError ?? 'Model previously failed'
						};
					}
					if (
						gateway === 'openrouter' &&
						orModels.length > 0 &&
						!orModels.some((m) => m.id === modelId)
					) {
						return {
							node,
							gateway,
							provider,
							modelId,
							healthy: false,
							reason: 'Model no longer available on OpenRouter'
						};
					}
					return { node, gateway, provider, modelId, healthy: true, reason: '' };
				});

				// Emit model-error immediately for unhealthy nodes (no API call)
				for (const h of nodeHealth) {
					if (!h.healthy) {
						log(`${h.node} unhealthy: ${h.reason}`, 'error');
						send('model-error', {
							node: h.node,
							gateway: h.gateway,
							provider: h.provider,
							error: h.reason
						});
					}
				}

				const healthyNodes = nodeHealth.filter((h) => h.healthy);

				if (healthyNodes.length === 0) {
					log('all models unhealthy — aborting', 'error');
					send('error', { message: 'All three models are unavailable' });
					close();
					return;
				}

				// Phase 1: Dispatch only to healthy MAGI nodes in parallel (streaming)
				log(
					`dispatching to nodes: ${healthyNodes.map((c) => `${c.node}/${c.modelId}`).join(', ')}`
				);
				const results = await Promise.allSettled(
					healthyNodes.map(async ({ node, gateway, provider, modelId }) => {
						try {
							const model = getModel(gateway, modelId);
							const temperamentPrompt = useTemperaments
								? TEMPERAMENT_SYSTEM_PROMPTS[NODE_TEMPERAMENTS[node]]
								: undefined;
							// OpenRouter models may not support the system role —
							// prepend temperament to the first user message instead
							const useSystem = temperamentPrompt && gateway !== 'openrouter';
							const messages = buildNodeMessages(node, history, query);
							if (temperamentPrompt && gateway === 'openrouter') {
								const first = messages[0];
								messages[0] = {
									role: 'user',
									content: `${temperamentPrompt}\n\n---\n\n${first.content as string}`
								};
							}
							// Cache the replayed thread — a no-op for non-Anthropic gateways.
							markCacheBreakpoint(messages);
							log(`${node} starting (${modelId}, ${history.length} prior turns)`);
							const result = streamText({
								model,
								...(useSystem && { system: temperamentPrompt }),
								messages,
								abortSignal: abortController.signal
							});
							let fullText = '';
							for await (const chunk of result.textStream) {
								fullText += chunk;
								send('model-chunk', { node, text: chunk });
							}
							const usage = await result.usage;
							const cached = usage.cachedInputTokens ?? 0;
							log(
								`${node} complete (${fullText.length} chars, ${usage.totalTokens ?? '?'} tokens` +
									`${cached ? `, ${cached} cached` : ''})`
							);
							const response: MagiResponse = { node, gateway, provider, text: fullText };
							send('model-response', response);
							send('model-usage', {
								node,
								inputTokens: usage.inputTokens ?? 0,
								outputTokens: usage.outputTokens ?? 0,
								cachedInputTokens: cached
							});
							return response;
						} catch (err) {
							// A client abort tears down every in-flight node at once — that
							// is not a model failure, so don't poison health or emit an error.
							if (abortController.signal.aborted) {
								throw err;
							}
							const message = extractErrorMessage(err);
							log(`${node} failed: ${message}`, 'error');
							markUnhealthy(modelId, message);
							send('model-error', { node, gateway, provider, error: message });
							throw err;
						}
					})
				);

				const responses: MagiResponse[] = results
					.filter((r): r is PromiseFulfilledResult<MagiResponse> => r.status === 'fulfilled')
					.map((r) => r.value);

				const totalNodes = config.length;

				log(
					`phase 1 complete: ${responses.length} responded, ${nodeHealth.filter((h) => !h.healthy).length} skipped (unhealthy)`
				);

				if (responses.length === 0) {
					log('all dispatched models failed — aborting', 'error');
					send('error', { message: 'All models failed to respond' });
					close();
					return;
				}

				if (responses.length < totalNodes) {
					log(`partial consensus: ${responses.length}/${totalNodes}`);
					send('partial-consensus', {
						responded: responses.length,
						total: totalNodes
					});
				}

				// Phase 2: Stream consensus synthesis
				log(`consensus starting (${strategyName} via ${config[consensusNodeIndex].node})`);
				const consensusStrategy = getStrategy(strategyName);
				const ctx: ConsensusContext = {
					responses,
					query,
					history: history.map((t) => ({ query: t.query, consensus: t.consensus })),
					getModel,
					nodeAssignments: config,
					consensusNodeIndex,
					consensusTemperament: useConsensusTemperament ?? false,
					temperaments: useAwareness ?? false,
					genericLabels: useGenericLabels ?? true,
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
						case 'usage':
							send('consensus-usage', {
								inputTokens: event.inputTokens,
								outputTokens: event.outputTokens,
								cachedInputTokens: event.cachedInputTokens
							});
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
