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
export const temperamentOverrideSchema = z.object({
	label: z.string().check(z.maxLength(MAX_TEMPERAMENT_LABEL)),
	prompt: z.string().check(z.maxLength(MAX_TEMPERAMENT_PROMPT))
});

// Request size limits. Exported so the client trims what it sends to the same
// bounds — otherwise a long thread dead-ends in a 400 on every later turn.
export const MAX_QUERY_LENGTH = 10_000;
export const MAX_NODE_TEXT_LENGTH = 50_000;
export const MAX_HISTORY_TURNS = 50;

// Shared with the localStorage schemas so a stored setting and an API request
// agree on what's acceptable.
export const debateRoundsSchema = z
	.number()
	.check(z.int(), z.gte(MIN_DEBATE_ROUNDS), z.lte(MAX_DEBATE_ROUNDS));

// A node's answer text, replayed as history or as a per-node-retry prior.
const nodeTextSchema = z.object({
	node: z.enum(MAGI_NODE_NAMES),
	text: z.string().check(z.maxLength(MAX_NODE_TEXT_LENGTH))
});

export const nodeAssignmentSchema = z.object({
	node: z.enum(MAGI_NODE_NAMES),
	gateway: z.enum(GATEWAY_NAMES),
	// Capped like every other request string: both are echoed into logs, the
	// `config` event and (for router seats) the health cache.
	provider: z.string().check(z.minLength(1), z.maxLength(64)),
	modelId: z.string().check(z.minLength(1), z.maxLength(128))
});

// The three seats' model assignments, one per node.
export const assignmentsSchema = z.tuple([
	nodeAssignmentSchema,
	nodeAssignmentSchema,
	nodeAssignmentSchema
]);

// One completed conversation turn, replayed as context for the next turn.
const historyTurnSchema = z.object({
	query: z.string().check(z.minLength(1), z.maxLength(MAX_QUERY_LENGTH)),
	nodeResponses: z.array(nodeTextSchema).check(z.maxLength(3)),
	consensus: z.string().check(z.maxLength(MAX_NODE_TEXT_LENGTH))
});

export const magiRequestSchema = z.object({
	query: z
		.string()
		.check(
			z.minLength(1, 'Query must not be empty'),
			z.maxLength(MAX_QUERY_LENGTH, 'Query too long')
		),
	tier: z.enum(TIER_NAMES),
	strategy: z.enum(STRATEGY_NAMES),
	/** Multi-Round Debate round ceiling. Out-of-range or non-integer values are
	 *  rejected (400); absent ⇒ the runner's default. Inert for other strategies. */
	debateRounds: z.optional(debateRoundsSchema),
	consensusNode: z.optional(z.enum(MAGI_NODE_NAMES)),
	assignments: z.optional(assignmentsSchema),
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
	/** false → ask every model that allows it to skip its reasoning step (OpenRouter
	 *  seats whose catalog entry says reasoning isn't mandatory). Absent ⇒ on. */
	reasoning: z.optional(z.boolean()),
	genericLabels: z.optional(z.boolean()),
	history: z.optional(z.array(historyTurnSchema).check(z.maxLength(MAX_HISTORY_TURNS))),
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
	priorResponses: z.optional(z.array(nodeTextSchema).check(z.maxLength(3)))
});

/** The `/api/magi` request body as the client builds it (before server-side
 *  defaults). Typing the client's payload against this makes a key that drifts
 *  from the schema a compile error instead of a silently-stripped field. */
export type MagiRequest = z.input<typeof magiRequestSchema>;

export type HistoryTurn = z.infer<typeof historyTurnSchema>;

export type TemperamentOverride = z.infer<typeof temperamentOverrideSchema>;
