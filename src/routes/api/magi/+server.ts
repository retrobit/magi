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
	type MagiConfig,
	type NodeAssignment
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
import { isRateLimited, retryAfterSeconds } from '$lib/server/rate-limit';
import {
	markUnhealthy,
	isModelHealthy,
	getHealthStatus,
	clearHealthEntry,
	UNHEALTHY_TTL
} from '$lib/server/health';
import { getOpenRouterFreeModels } from '$lib/server/openrouter';
import { markCacheBreakpoint } from '$lib/magi/prompt-cache';
import { logEvent, startTimer } from '$lib/server/logger';
import { checkApiKey } from '$lib/server/auth';

// Validate hardcoded configs once at module load
validateConfig(DEFAULT_MAGI_CONFIG);
validateConfig(FREE_MAGI_CONFIG);

/** Classify an error message to decide whether to poison the health cache.
 *  Only availability-shaped failures (HTTP 404/410/5xx, "No endpoints found",
 *  model-not-found variants) should mark a model unhealthy — context-window
 *  overflows, auth rejections, and rate-limits are per-request conditions that
 *  don't indicate the model itself is down, so caching them blocks retries for
 *  2 min on every turn for no gain. Exported for unit tests. */
export function _isAvailabilityError(message: string): boolean {
	const lower = message.toLowerCase();
	// Exclusions run FIRST: per-request failures must never poison the cache,
	// and their messages routinely contain 3-digit numbers ("maximum context
	// length is 512 tokens", "limit of 500 requests per day") that the
	// status-code patterns below would otherwise match.
	if (
		lower.includes('context') ||
		lower.includes('token') ||
		/\b(401|403|429)\b/.test(message) ||
		lower.includes('unauthorized') ||
		lower.includes('forbidden') ||
		lower.includes('rate limit') ||
		lower.includes('rate_limit')
	)
		return false;
	// OpenRouter "no endpoints" fires when no provider serves the model right now
	if (lower.includes('no endpoints found')) return true;
	// Model-not-found and similar gone/missing phrases
	if (lower.includes('model not found') || lower.includes('does not exist')) return true;
	// HTTP 5xx surfaced as text (some providers include the status in the message)
	if (/\b5\d{2}\b/.test(message)) return true;
	// HTTP 404 / 410 surfaced as text
	if (/\b(404|410)\b/.test(message)) return true;
	// Default: treat unknown errors as availability failures so genuinely broken
	// models are still cached (conservative — avoids hammering a down endpoint).
	return true;
}

// Exported for unit testing — the nested unwrap is brittle enough to warrant
// direct coverage of each error shape. SvelteKit reserves bare exports from
// route files for handler names, so this is prefixed with `_` per its convention.
export function _extractErrorMessage(err: unknown): string {
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
		if (retryErr.lastError) return _extractErrorMessage(retryErr.lastError);
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
	// 8-hex correlation ID — stamped on every log line for this request and
	// returned to the client as X-Request-Id so the same trace can be grepped
	// from either side. Short on purpose; not security-sensitive.
	const requestId = crypto.randomUUID().slice(0, 8);
	const ip = getClientAddress();

	// All JSON error responses carry X-Request-Id so callers can quote it when
	// reporting bugs. The SSE response sets the header separately.
	const errResp = (body: object, status: number): Response =>
		json(body, { status, headers: { 'X-Request-Id': requestId } });

	// API key auth (opt-in: enforced when MAGI_API_KEY is set in env)
	const authFail = checkApiKey(request);
	if (authFail) {
		logEvent('warn', 'request.unauthorized', { requestId, ip });
		return authFail;
	}

	// Rate limiting (sliding window per IP)
	if (isRateLimited(ip)) {
		logEvent('warn', 'request.rate_limited', { requestId, ip });
		const retryAfter = retryAfterSeconds(ip);
		return json(
			{ error: 'Too many requests' },
			{
				status: 429,
				headers: {
					'X-Request-Id': requestId,
					// Standard header so clients can surface a concrete wait time
					// rather than showing a generic "slow down" message.
					'Retry-After': String(retryAfter)
				}
			}
		);
	}

	// Content-Type validation
	if (!request.headers.get('content-type')?.includes('application/json')) {
		logEvent('warn', 'request.unsupported_media_type', { requestId, ip });
		return errResp({ error: 'Content-Type must be application/json' }, 415);
	}

	const body = await request.json().catch((err: unknown) => {
		logEvent('error', 'request.parse_failed', {
			requestId,
			error: err instanceof Error ? err.message : String(err)
		});
		return null;
	});
	if (!body) {
		return errResp({ error: 'Invalid JSON' }, 400);
	}

	const parsed = magiRequestSchema.safeParse(body);
	if (!parsed.success) {
		const details = parsed.error.issues.map((i) => i.message);
		logEvent('warn', 'request.invalid', { requestId, details: details.join('; ') });
		return errResp({ error: 'Invalid request', details }, 400);
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
		history = [],
		forceRetry = false
	} = parsed.data;

	logEvent('info', 'request', {
		requestId,
		ip,
		tier,
		strategy: strategyName,
		temperaments: useTemperaments ?? false,
		priorTurns: history.length
	});

	// Use client assignments if provided, otherwise fall back to tier preset
	let config: MagiConfig;
	if (clientAssignments) {
		// Defense in depth: derive each assignment's `provider` from an
		// authoritative source (registry for direct APIs, slug prefix for
		// OpenRouter models) BEFORE validation. The client-sent `provider`
		// is otherwise unverified — fake unique strings would slip past
		// `validateConfig`'s diversity rule and mislabel the response stream.
		// Build as a plain array, then cast — MagiConfig is a fixed-arity
		// tuple. Schema validation upstream guarantees three elements.
		const sanitized: NodeAssignment[] = [];
		for (const a of clientAssignments) {
			if (a.gateway === 'openrouter') {
				// OpenRouter model IDs are `provider/model[:variant]`; the
				// leading segment is the canonical provider. Existence is
				// confirmed by the pre-flight health check below, so
				// non-conforming IDs fail loudly there.
				const slugProvider = a.modelId.split('/')[0];
				sanitized.push({ ...a, provider: slugProvider || a.provider });
			} else {
				const entry = findModelEntry(a.gateway, a.modelId, tier);
				if (!entry) {
					const exists = findModelEntry(a.gateway, a.modelId);
					const reason = exists
						? `Model "${a.modelId}" is not available in the "${tier}" tier`
						: `Unknown model "${a.modelId}" for gateway "${a.gateway}"`;
					logEvent('warn', 'request.invalid_assignment', { requestId, reason });
					return errResp({ error: reason }, 400);
				}
				sanitized.push({ ...a, provider: entry.provider });
			}
		}
		config = sanitized as unknown as MagiConfig;
		try {
			validateConfig(config);
		} catch (err) {
			const reason = err instanceof Error ? err.message : 'validation failed';
			logEvent('warn', 'request.invalid_assignment', { requestId, reason });
			return errResp({ error: `Invalid assignments: ${reason}` }, 400);
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
		const reason = `Invalid consensusNode: "${requestedConsensusNode}" is not in the current config`;
		logEvent('warn', 'request.invalid_assignment', { requestId, reason });
		return errResp({ error: reason }, 400);
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

				// forceRetry: clear cached unhealthy entries so the pre-flight check
				// actually re-calls the API instead of bouncing off a stale mark.
				if (forceRetry) {
					for (const { modelId } of config) clearHealthEntry(modelId);
				}

				// Pre-flight health check — catch unhealthy models before burning tokens
				const orModels = config.some((a) => a.gateway === 'openrouter')
					? await getOpenRouterFreeModels()
					: [];
				const nodeHealth = config.map(({ node, gateway, provider, modelId }) => {
					if (!isModelHealthy(modelId)) {
						const entry = getHealthStatus(modelId);
						// Build an honest skip message that tells the client when the
						// auto-retry window opens, so the UI can show a concrete wait.
						const agoMs = entry ? Date.now() - entry.lastChecked : 0;
						const agoS = Math.round(agoMs / 1000);
						const remainMs = entry ? Math.max(0, UNHEALTHY_TTL - agoMs) : 0;
						const remainS = Math.ceil(remainMs / 1000);
						const lastErr = entry?.lastError ?? 'unknown error';
						const reason = `Skipped: failed ${agoS}s ago (${lastErr}); auto-retries in ${remainS}s`;
						return {
							node,
							gateway,
							provider,
							modelId,
							healthy: false,
							reason
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
							requestId,
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
					logEvent('error', 'request.aborted', {
						requestId,
						reason: 'all models unhealthy'
					});
					send('error', { message: 'All three models are unavailable' });
					close();
					return;
				}

				// Phase 1: Dispatch only to healthy MAGI nodes in parallel (streaming)
				logEvent('info', 'phase1.dispatch', {
					requestId,
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
							// Multi-Round Debate uses each model's opening answer as round 0, so we
							// ask each model to seal its reply with a `SUMMARY:` line — those become
							// the "Initial positions" ledger entries (rather than a heuristic first-
							// sentence gist). Only attached to the current query, so prior turns'
							// replayed history isn't mutated.
							if (strategyName === 'debate') {
								const last = messages[messages.length - 1];
								messages[messages.length - 1] = {
									role: 'user',
									content: `${last.content as string}\n\nAt the very end of your reply, on its own line, write:\nSUMMARY: <one short sentence stating your position on the question>`
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
							// Accumulate via array+join rather than `+=` — long responses
							// otherwise pay O(n²) for repeated string reallocations.
							const chunks: string[] = [];
							for await (const chunk of result.textStream) {
								ttftMs ??= nodeTimer();
								chunks.push(chunk);
								send('model-chunk', { node, text: chunk });
							}
							const fullText = chunks.join('');
							const usage = await result.usage;
							const cached = usage.cachedInputTokens ?? 0;
							logEvent('info', 'node.complete', {
								requestId,
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
							const message = _extractErrorMessage(err);
							logEvent('error', 'node.failed', {
								requestId,
								node,
								model: modelId,
								error: message
							});
							// Only availability-shaped failures warrant poisoning the cache —
							// context-length overflows, auth rejections, and rate-limits are
							// per-request, so marking the model unhealthy would block every
							// subsequent turn for 2 minutes for no reason.
							if (_isAvailabilityError(message)) {
								markUnhealthy(modelId, message);
							}
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
					requestId,
					responded: responses.length,
					skipped: nodeHealth.filter((h) => !h.healthy).length,
					elapsedMs: requestTimer()
				});

				if (responses.length === 0) {
					logEvent('error', 'request.aborted', {
						requestId,
						reason: 'all dispatched models failed'
					});
					send('error', { message: 'All models failed to respond' });
					close();
					return;
				}

				// `none` skips the consensus phase entirely — short-circuit BEFORE
				// emitting any consensus-specific signals (partial-consensus warns
				// the consensus is based on partial data, which is misleading when
				// no consensus runs at all). Individual model-error events have
				// already surfaced any failed nodes upstream.
				if (strategyName === 'none') {
					logEvent('info', 'request.complete', {
						requestId,
						elapsedMs: requestTimer(),
						strategy: 'none'
					});
					close();
					return;
				}

				if (responses.length < totalNodes) {
					logEvent('warn', 'consensus.partial', {
						requestId,
						responded: responses.length,
						total: totalNodes
					});
					send('partial-consensus', {
						responded: responses.length,
						total: totalNodes
					});
				}

				// Phase 2: Stream consensus synthesis.
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
								requestId,
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
									requestId,
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
				logEvent('info', 'request.complete', { requestId, elapsedMs: requestTimer() });
			} catch (err) {
				logEvent('error', 'request.failed', {
					requestId,
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
			'Cache-Control': 'no-cache',
			'X-Request-Id': requestId
		}
	});
};
