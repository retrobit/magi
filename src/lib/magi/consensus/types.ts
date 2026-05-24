import type { LanguageModel } from 'ai';
import type { MagiResponse, GatewayName, MagiNodeName } from '../types';
import type { NodeAssignment } from '../config';

/** Per-juror breakdown of which anonymized candidate got which score. */
export interface VotingJurorBreakdown {
	juror: MagiNodeName;
	jurorModel: string;
	/** Score this juror gave Candidate A (the first peer in alphabetical-by-node order). */
	candidateA: { node: MagiNodeName; score: number | null };
	/** Score this juror gave Candidate B (the second peer). */
	candidateB?: { node: MagiNodeName; score: number | null };
}

/** Voting-only metrics — the rich juror/position/tiebreak signal. Lives under
 *  `RunStats.voting`; absent for synthesis runs (which crown no winner). */
export interface VotingStats {
	winner: MagiNodeName;
	winnerModel: string;
	winnerTotal: number;
	/** Decisive | best-score-tiebreak | node-order-tiebreak | walkover (1 response). */
	tiebreak: 'none' | 'best-score' | 'node-order' | 'walkover';
	/** Aggregate score per node from all jurors combined. */
	totals: Record<MagiNodeName, number>;
	/** Response length in characters per node — lets you check length-vs-win correlation. */
	lengths: Record<MagiNodeName, number>;
	models: Record<MagiNodeName, string>;
	/** Per-juror, per-candidate score grid (the richest signal — position bias lives here). */
	jurors: VotingJurorBreakdown[];
	/** Average score given to Candidate A across all jurors — vs Candidate B. */
	positionBias: { avgA: number; avgB: number; n: number };
}

/** Where a single node's response came from — the axes the stats panel breaks
 *  usage (and voting wins) down by. */
export interface NodeIdentity {
	gateway: GatewayName;
	provider: string;
	model: string;
}

/** One consensus run, regardless of strategy. Every run emits exactly one of
 *  these; voting runs additionally fill in `voting`. This is the unit the stats
 *  panel aggregates over. */
export interface RunStats {
	strategy: StrategyName;
	/** Active configuration when the run executed. */
	tier: string;
	temperaments: boolean;
	consensusTemperament: boolean;
	/** Identity of each node that responded this run — drives usage breakdowns. */
	nodes: Partial<Record<MagiNodeName, NodeIdentity>>;
	/** Voting-only rich metrics. Absent for synthesis. */
	voting?: VotingStats;
}

export type ConsensusEvent =
	| { type: 'text-delta'; text: string }
	| { type: 'complete'; fullText: string }
	| { type: 'usage'; inputTokens: number; outputTokens: number; cachedInputTokens: number }
	| { type: 'run-stats'; stats: RunStats };

/** Assemble the per-node identity map a `RunStats` carries, pairing each
 *  responding node's gateway/provider with the model it was assigned. */
export function nodeIdentities(
	responses: MagiResponse[],
	assignments: readonly NodeAssignment[]
): Partial<Record<MagiNodeName, NodeIdentity>> {
	const out: Partial<Record<MagiNodeName, NodeIdentity>> = {};
	for (const r of responses) {
		const model = assignments.find((a) => a.node === r.node)?.modelId ?? 'unknown';
		out[r.node] = { gateway: r.gateway, provider: r.provider, model };
	}
	return out;
}

// A prior consensus turn — the consensus node's own thread across the conversation.
export interface ConsensusHistoryTurn {
	query: string;
	consensus: string;
}

export interface ConsensusContext {
	responses: MagiResponse[];
	query: string;
	history?: ConsensusHistoryTurn[];
	getModel: (gateway: GatewayName, modelId: string) => LanguageModel;
	nodeAssignments: readonly NodeAssignment[];
	consensusNodeIndex: number;
	consensusTemperament?: boolean;
	temperaments?: boolean;
	genericLabels?: boolean;
	signal?: AbortSignal;
	/** Tier label for stats annotation (purely informational; strategies don't branch on it). */
	tier?: string;
}

export interface ConsensusStrategy {
	name: string;
	description: string;
	execute(ctx: ConsensusContext): AsyncIterable<ConsensusEvent>;
}

export const STRATEGY_NAMES = ['synthesis', 'voting'] as const;
export type StrategyName = (typeof STRATEGY_NAMES)[number];
export const DEFAULT_STRATEGY: StrategyName = 'synthesis';

export const STRATEGY_LABELS: Record<StrategyName, string> = {
	synthesis: 'Synthesis',
	voting: 'Structured Voting'
};

// Hover-explainer text for each strategy in the dropdown, so a first-time user
// can tell them apart without leaving for the README.
export const STRATEGY_DESCRIPTIONS: Record<StrategyName, string> = {
	synthesis:
		'A consensus model reads all three responses and writes one unified answer — merging agreements, resolving conflicts, and flagging uncertainty.',
	voting:
		'Each model scores its peers’ answers (anonymized) 0–10. The highest-scoring response wins and is shown verbatim with a tally — no consensus model writes anything.'
};

/** Text shown in the consensus panel while a strategy is still running. */
export const STRATEGY_PENDING_LABELS: Record<StrategyName, string> = {
	synthesis: 'Synthesizing consensus…',
	voting: 'Tallying votes…'
};
