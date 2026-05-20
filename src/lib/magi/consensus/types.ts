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

export interface VotingStats {
	strategy: 'voting';
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
	/** Active configuration when the vote ran. */
	config: {
		tier: string;
		temperaments: boolean;
		consensusTemperament: boolean;
	};
}

export type ConsensusEvent =
	| { type: 'text-delta'; text: string }
	| { type: 'complete'; fullText: string }
	| { type: 'usage'; inputTokens: number; outputTokens: number; cachedInputTokens: number }
	| { type: 'stats'; stats: VotingStats };

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

/** Text shown in the consensus panel while a strategy is still running. */
export const STRATEGY_PENDING_LABELS: Record<StrategyName, string> = {
	synthesis: 'Synthesizing consensus…',
	voting: 'Tallying votes…'
};
