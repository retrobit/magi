import { z } from 'zod';
import { TIER_NAMES, MAGI_NODE_NAMES, GATEWAY_NAMES } from './types';
import { STRATEGY_NAMES, MIN_DEBATE_ROUNDS, MAX_DEBATE_ROUNDS } from './consensus/types';
import { MAX_TEMPERAMENT_LABEL, MAX_TEMPERAMENT_PROMPT } from './temperaments';

// CSP: zod 4 probes `new Function('')` once to decide whether it may JIT-compile
// parsers, and the blocked probe logs an eval violation in every visitor's
// console under our strict script-src. jitless skips the probe entirely — same
// behavior (the CSP already forced the jitless path), just without the noise.
// persistence.ts imports this module, so one call here covers every zod user.
z.config({ jitless: true });

// A single per-node temperament override. Both fields are capped so a crafted
// payload can't bloat the injected prompt; either may be blank (the server fills
// in the built-in for an empty field).
const temperamentOverrideSchema = z.object({
	label: z.string().max(MAX_TEMPERAMENT_LABEL),
	prompt: z.string().max(MAX_TEMPERAMENT_PROMPT)
});

export const nodeAssignmentSchema = z.object({
	node: z.enum(MAGI_NODE_NAMES),
	gateway: z.enum(GATEWAY_NAMES),
	provider: z.string().min(1),
	modelId: z.string().min(1)
});

// One completed conversation turn, replayed as context for the next turn.
const historyTurnSchema = z.object({
	query: z.string().min(1).max(10_000),
	nodeResponses: z
		.array(
			z.object({
				node: z.enum(MAGI_NODE_NAMES),
				text: z.string().max(50_000)
			})
		)
		.max(3),
	consensus: z.string().max(50_000)
});

export const magiRequestSchema = z.object({
	query: z.string().min(1, 'Query must not be empty').max(10_000, 'Query too long'),
	tier: z.enum(TIER_NAMES),
	strategy: z.enum(STRATEGY_NAMES),
	/** Multi-Round Debate round ceiling. Out-of-range values are clamped by the
	 *  debate runner; absent ⇒ the runner's default. Inert for other strategies. */
	debateRounds: z.number().int().min(MIN_DEBATE_ROUNDS).max(MAX_DEBATE_ROUNDS).optional(),
	consensusNode: z.enum(MAGI_NODE_NAMES).optional(),
	assignments: z
		.tuple([nodeAssignmentSchema, nodeAssignmentSchema, nodeAssignmentSchema])
		.optional(),
	temperaments: z.boolean().optional(),
	consensusTemperament: z.boolean().optional(),
	temperamentAwareness: z.boolean().optional(),
	/** Per-node temperament overrides (the "edit personas" feature). Sparse —
	 *  nodes absent here keep their built-in temperament. Only consulted when
	 *  `temperaments` is on. */
	customTemperaments: z
		.partialRecord(z.enum(MAGI_NODE_NAMES), temperamentOverrideSchema)
		.optional(),
	/** Push models to commit to a single answer on open-ended questions. */
	opinionated: z.boolean().optional(),
	/** Push debaters to weigh peers and lean toward convergence (debate only). */
	collaborative: z.boolean().optional(),
	genericLabels: z.boolean().optional(),
	history: z.array(historyTurnSchema).max(50).optional(),
	/** When true, bypasses the pre-flight unhealthy-cache check for every model in
	 *  this request and clears those cache entries — so a retry actually re-calls
	 *  a model rather than bouncing off a stale markUnhealthy entry. */
	forceRetry: z.boolean().optional(),
	/** Per-node retry: restrict the phase-1 dispatch to just these nodes (their
	 *  health cache is cleared so they actually re-call). The other nodes' answers
	 *  arrive via `priorResponses`. Empty/absent ⇒ run all nodes as a normal turn. */
	retryNodes: z.array(z.enum(MAGI_NODE_NAMES)).max(3).optional(),
	/** Per-node retry: the already-good answers for the nodes NOT being retried, so
	 *  consensus runs over the full set without re-billing them. Gateway/provider are
	 *  taken from the server's own config (text only here) so a client can't spoof
	 *  the origin of a response. */
	priorResponses: z
		.array(z.object({ node: z.enum(MAGI_NODE_NAMES), text: z.string().max(50_000) }))
		.max(3)
		.optional()
});

export type HistoryTurn = z.infer<typeof historyTurnSchema>;
