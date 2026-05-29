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
import { isRateLimited } from '$lib/server/rate-limit';
import { markUnhealthy, isModelHealthy, getHealthStatus } from '$lib/server/health';
import { getOpenRouterFreeModels } from '$lib/server/openrouter';
import { markCacheBreakpoint } from '$lib/magi/prompt-cache';
import { logEvent, startTimer } from '$lib/server/logger';
import { checkApiKey } from '$lib/server/auth';

// Validate hardcoded configs once at module load
validateConfig(DEFAULT_MAGI_CONFIG);
validateConfig(FREE_MAGI_CONFIG);

// Exported for unit testing — the nested unwrap is brittle enough to warrant
// direct coverage of each error shape.
export function extractErrorMessage(err: unknown): string {
	if (err && typeof err === 'object') {
		// AI SDK wraps upstream errors — dig into responseBody for the real message
		const apiErr = err as { responseBody?: string };
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
	}
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

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const requestTimer = startTimer();
	// API key auth (opt-in: enforced when MAGI_API_KEY is set in env)
	const authFail = checkApiKey(request);
	if (authFail) return authFail;

	// Rate limiting (sliding window per IP)
	if (isRateLimited(getClientAddress())) {
		return json({ error: 'Too many requests' }, { status: 429 });
	}

	// Content-Type validation
	if (!request.headers.get('content-type')?.includes('application/json')) {
		return json({ error: 'Content-Type must be application/json' }, { status: 415 });
	}

	const body = await request.json().catch((err: unknown) => {
		logEvent('error', 'request.parse_failed', {
			error: err instanceof Error ? err.message : String(err)
		});
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

	logEvent('info', 'request', {
		tier,
		strategy: strategyName,
		temperaments: useTemperaments ?? false,
		priorTurns: history.length
	});

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
						logEvent('warn', 'node.unhealthy', {
							node: h.node,
							model: h.modelId,
							reason: h.reason
						});
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
					logEvent('error', 'request.aborted', { reason: 'all models unhealthy' });
					send('error', { message: 'All three models are unavailable' });
					close();
					return;
				}

				// Phase 1: Dispatch only to healthy MAGI nodes in parallel (streaming)
				logEvent('info', 'phase1.dispatch', {
					nodes: healthyNodes.map((c) => `${c.node}/${c.modelId}`).join(',')
				});
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
							const nodeTimer = startTimer();
							let ttftMs: number | null = null;
							const result = streamText({
								model,
								...(useSystem && { system: temperamentPrompt }),
								messages,
								abortSignal: abortController.signal
							});
							let fullText = '';
							for await (const chunk of result.textStream) {
								ttftMs ??= nodeTimer();
								fullText += chunk;
								send('model-chunk', { node, text: chunk });
							}
							const usage = await result.usage;
							const cached = usage.cachedInputTokens ?? 0;
							logEvent('info', 'node.complete', {
								node,
								model: modelId,
								ttftMs: ttftMs ?? nodeTimer(),
								totalMs: nodeTimer(),
								inputTokens: usage.inputTokens ?? 0,
								outputTokens: usage.outputTokens ?? 0,
								cachedTokens: cached,
								chars: fullText.length
							});
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
							logEvent('error', 'node.failed', { node, model: modelId, error: message });
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

				logEvent('info', 'phase1.complete', {
					responded: responses.length,
					skipped: nodeHealth.filter((h) => !h.healthy).length,
					elapsedMs: requestTimer()
				});

				if (responses.length === 0) {
					logEvent('error', 'request.aborted', { reason: 'all dispatched models failed' });
					send('error', { message: 'All models failed to respond' });
					close();
					return;
				}

				if (responses.length < totalNodes) {
					logEvent('warn', 'consensus.partial', {
						responded: responses.length,
						total: totalNodes
					});
					send('partial-consensus', {
						responded: responses.length,
						total: totalNodes
					});
				}

				// Phase 2: Stream consensus synthesis
				const consensusStrategy = getStrategy(strategyName);
				const consensusSeat = config[consensusNodeIndex];
				const ctx: ConsensusContext = {
					responses,
					query,
					history: history.map((t) => ({ query: t.query, consensus: t.consensus })),
					getModel,
					nodeAssignments: config,
					consensusNodeIndex,
					consensusTemperament: useConsensusTemperament ?? false,
					temperaments: useAwareness ?? false,
					nodeTemperaments: useTemperaments ?? false,
					genericLabels: useGenericLabels ?? true,
					signal: abortController.signal,
					tier
				};

				const consensusTimer = startTimer();
				let consensusTtftMs: number | null = null;
				for await (const event of consensusStrategy.execute(ctx)) {
					switch (event.type) {
						case 'text-delta':
							consensusTtftMs ??= consensusTimer();
							send('consensus-chunk', { text: event.text });
							break;
						case 'complete':
							send('consensus-complete', {
								text: event.fullText,
								debateVerdict: event.debateVerdict,
								debateSummary: event.debateSummary
							});
							break;
						case 'usage':
							logEvent('info', 'consensus.complete', {
								strategy: strategyName,
								node: consensusSeat.node,
								model: consensusSeat.modelId,
								ttftMs: consensusTtftMs ?? consensusTimer(),
								totalMs: consensusTimer(),
								inputTokens: event.inputTokens,
								outputTokens: event.outputTokens,
								cachedTokens: event.cachedInputTokens
							});
							send('consensus-usage', {
								inputTokens: event.inputTokens,
								outputTokens: event.outputTokens,
								cachedInputTokens: event.cachedInputTokens
							});
							break;
						case 'run-stats': {
							const s = event.stats;
							const v = s.voting;
							// Only voting runs carry the rich winner/juror metrics worth a
							// dedicated log line — synthesis already logged consensus.complete.
							if (v) {
								// Flatten the nested per-juror grid into greppable key=value
								// lines (`MELCHIOR_A=BALTHASAR:7`) so a tail of dev logs reads
								// cleanly without needing a JSON parser.
								const jurorPairs = v.jurors.flatMap((j) => {
									const out: string[] = [];
									out.push(`${j.juror}_A=${j.candidateA.node}:${j.candidateA.score ?? '∅'}`);
									if (j.candidateB) {
										out.push(`${j.juror}_B=${j.candidateB.node}:${j.candidateB.score ?? '∅'}`);
									}
									return out;
								});
								logEvent('info', 'vote.complete', {
									strategy: s.strategy,
									tier: s.tier,
									temperaments: s.temperaments,
									consensusTemperament: s.consensusTemperament,
									winner: v.winner,
									winnerModel: v.winnerModel,
									winnerTotal: v.winnerTotal,
									tiebreak: v.tiebreak,
									totals: Object.entries(v.totals)
										.map(([n, t]) => `${n}:${t}`)
										.join(','),
									lengths: Object.entries(v.lengths)
										.map(([n, l]) => `${n}:${l}`)
										.join(','),
									avgA: v.positionBias.avgA.toFixed(2),
									avgB: v.positionBias.avgB.toFixed(2),
									biasN: v.positionBias.n,
									jurors: jurorPairs.join(',')
								});
							}
							send('run-stats', s);
							break;
						}
						case 'node-round':
							send('node-round', { node: event.node, entry: event.entry });
							break;
					}
				}
				logEvent('info', 'request.complete', { elapsedMs: requestTimer() });
			} catch (err) {
				logEvent('error', 'request.failed', {
					error: err instanceof Error ? err.message : String(err),
					elapsedMs: requestTimer()
				});
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
