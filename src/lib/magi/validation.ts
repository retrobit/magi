import * as z from 'zod/mini';
import { TIER_NAMES, MAGI_NODE_NAMES, GATEWAY_NAMES } from './types';
import { STRATEGY_NAMES, MIN_DEBATE_ROUNDS, MAX_DEBATE_ROUNDS } from './consensus/types';
import { MAX_TEMPERAMENT_LABEL, MAX_TEMPERAMENT_PROMPT } from './temperaments';

// zod/mini (same package, functional API): a fraction of classic zod's client
// weight, and — unlike classic zod — it never runs the `new Function('')` eval
// probe, so no `z.config({ jitless })` workaround is needed under the strict CSP.

// A single per-node temperament override. Both fields are capped so a crafted
// payload can't bloat the injected prompt; either may be blank (the server fills
// in the built-in for an empty field).
const temperamentOverrideSchema = z.object({
	label: z.string().check(z.maxLength(MAX_TEMPERAMENT_LABEL)),
	prompt: z.string().check(z.maxLength(MAX_TEMPERAMENT_PROMPT))
});

export const nodeAssignmentSchema = z.object({
	node: z.enum(MAGI_NODE_NAMES),
	gateway: z.enum(GATEWAY_NAMES),
	provider: z.string().check(z.minLength(1)),
	modelId: z.string().check(z.minLength(1))
});

// One completed conversation turn, replayed as context for the next turn.
const historyTurnSchema = z.object({
	query: z.string().check(z.minLength(1), z.maxLength(10_000)),
	nodeResponses: z
		.array(
			z.object({
				node: z.enum(MAGI_NODE_NAMES),
				text: z.string().check(z.maxLength(50_000))
			})
		)
		.check(z.maxLength(3)),
	consensus: z.string().check(z.maxLength(50_000))
});

export const magiRequestSchema = z.object({
	query: z
		.string()
		.check(z.minLength(1, 'Query must not be empty'), z.maxLength(10_000, 'Query too long')),
	tier: z.enum(TIER_NAMES),
	strategy: z.enum(STRATEGY_NAMES),
	/** Multi-Round Debate round ceiling. Out-of-range values are clamped by the
	 *  debate runner; absent ⇒ the runner's default. Inert for other strategies. */
	debateRounds: z.optional(
		z.number().check(z.int(), z.gte(MIN_DEBATE_ROUNDS), z.lte(MAX_DEBATE_ROUNDS))
	),
	consensusNode: z.optional(z.enum(MAGI_NODE_NAMES)),
	assignments: z.optional(
		z.tuple([nodeAssignmentSchema, nodeAssignmentSchema, nodeAssignmentSchema])
	),
	temperaments: z.optional(z.boolean()),
	consensusTemperament: z.optional(z.boolean()),
	temperamentAwareness: z.optional(z.boolean()),
	/** Per-node temperament overrides (the "edit personas" feature). Sparse —
	 *  nodes absent here keep their built-in temperament. Only consulted when
	 *  `temperaments` is on. */
	customTemperaments: z.optional(
		z.partialRecord(z.enum(MAGI_NODE_NAMES), temperamentOverrideSchema)
	),
	/** Push models to commit to a single answer on open-ended questions. */
	opinionated: z.optional(z.boolean()),
	/** Push debaters to weigh peers and lean toward convergence (debate only). */
	collaborative: z.optional(z.boolean()),
	genericLabels: z.optional(z.boolean()),
	history: z.optional(z.array(historyTurnSchema).check(z.maxLength(50))),
	/** When true, bypasses the pre-flight unhealthy-cache check for every model in
	 *  this request and clears those cache entries — so a retry actually re-calls
	 *  a model rather than bouncing off a stale markUnhealthy entry. */
	forceRetry: z.optional(z.boolean()),
	/** Per-node retry: restrict the phase-1 dispatch to just these nodes (their
	 *  health cache is cleared so they actually re-call). The other nodes' answers
	 *  arrive via `priorResponses`. Empty/absent ⇒ run all nodes as a normal turn. */
	retryNodes: z.optional(z.array(z.enum(MAGI_NODE_NAMES)).check(z.maxLength(3))),
	/** Per-node retry: the already-good answers for the nodes NOT being retried, so
	 *  consensus runs over the full set without re-billing them. Gateway/provider are
	 *  taken from the server's own config (text only here) so a client can't spoof
	 *  the origin of a response. */
	priorResponses: z.optional(
		z
			.array(
				z.object({ node: z.enum(MAGI_NODE_NAMES), text: z.string().check(z.maxLength(50_000)) })
			)
			.check(z.maxLength(3))
	)
});

export type HistoryTurn = z.infer<typeof historyTurnSchema>;
