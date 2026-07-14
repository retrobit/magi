import type { LanguageModel } from 'ai';
import type {
	MagiResponse,
	GatewayName,
	MagiNodeName,
	DebateRoundEntry,
	DebateVerdict
} from '../types';
import type { NodeAssignment } from '../config';
import type { CustomTemperaments } from '../temperaments';

/** Per-juror breakdown of which anonymized candidate got which score. */
export interface VotingJurorBreakdown {
	juror: MagiNodeName;
	jurorModel: string;
	/** Score this juror gave Candidate A (the first peer in this turn's seat order —
	 *  node order when peer-order randomization is off, shuffled when it's on). */
	candidateA: { node: MagiNodeName; score: number | null };
	/** Score this juror gave Candidate B (the second peer in the seat order). */
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

/** Debate-only metrics — convergence shape, per-node stickiness, dissent. Lives
 *  under `RunStats.debate`; absent for non-debate strategies and for debate runs
 *  with zero responses (nothing happened to measure). */
export interface DebateStats {
	/** consensus / split / walkover. Walkover means only one node responded. */
	verdict: DebateVerdict;
	/** True when the run ran every allowed round and never converged — only meaningful
	 *  for split outcomes. False for walkover and consensus-by-stability. */
	hitLimit: boolean;
	/** Rounds actually executed. 0 for walkover (no debate happens). */
	rounds: number;
	/** Per node, count of rounds where the debater materially revised its answer.
	 *  Denominator is `rounds` — `revisions[node] / rounds` is the revision rate. */
	revisions: Partial<Record<MagiNodeName, number>>;
	/** Model each responding node used — separates "node bias" from "model bias". */
	models: Partial<Record<MagiNodeName, string>>;
	/** For a 'split' verdict with a clean 2-vs-1 coalition, the dissenter; null
	 *  for three-way splits, non-split outcomes, and walkover. */
	dissenter: MagiNodeName | null;
}

/** One consensus run, regardless of strategy. Every run emits exactly one of
 *  these; voting runs additionally fill in `voting`, debate runs `debate`. This
 *  is the unit the stats panel aggregates over. */
export interface RunStats {
	strategy: StrategyName;
	/** Active configuration when the run executed. */
	tier: string;
	/** Whether the synthesizer was told the nodes answered through dispositional
	 *  lenses (the Awareness toggle) — fed by the request's `temperamentAwareness`.
	 *  Named for what it actually holds; see [[ConsensusContext.synthesizerAwareness]]. */
	synthesizerAwareness: boolean;
	consensusTemperament: boolean;
	/** Identity of each node that responded this run — drives usage breakdowns. */
	nodes: Partial<Record<MagiNodeName, NodeIdentity>>;
	/** Voting-only rich metrics. Absent for synthesis and debate. */
	voting?: VotingStats;
	/** Debate-only rich metrics. Absent for synthesis and voting. */
	debate?: DebateStats;
}

export type ConsensusEvent =
	| { type: 'text-delta'; text: string }
	// `debateVerdict` is set only by the debate strategy — the consensus/split
	// outcome the banner keys off; `debateSummary` carries a split's coalition
	// shape (e.g. "X & Y aligned; Z dissents"). Other strategies omit both.
	| { type: 'complete'; fullText: string; debateVerdict?: DebateVerdict; debateSummary?: string }
	| { type: 'usage'; inputTokens: number; outputTokens: number; cachedInputTokens: number }
	| { type: 'run-stats'; stats: RunStats }
	// Per-node, per-round debate activity — surfaced in the node panels, not the
	// consensus stream. Only the debate strategy emits these.
	| { type: 'node-round'; node: MagiNodeName; entry: DebateRoundEntry };

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
	/** Whether the consensus synthesizer is told the nodes answered through distinct
	 *  dispositional lenses — fed by the request's `temperamentAwareness` toggle (NOT
	 *  the node-temperament one). Synthesis uses it to surface WHY perspectives
	 *  diverge by lens; voting/debate record it but don't act on it. Named for what
	 *  it carries so it can't be mistaken for [[nodeTemperaments]]. */
	synthesizerAwareness?: boolean;
	/** Whether the MAGI answered in-character (the main Temperaments toggle). Debate
	 *  uses this to decide if the debaters argue through their dispositional lens. */
	nodeTemperaments?: boolean;
	/** Per-node temperament overrides (edited personas). When awareness is on,
	 *  synthesis resolves these so the synthesizer is told the ACTUAL lens each node
	 *  used (custom label + persona), not the hard-coded built-in name. */
	customTemperaments?: CustomTemperaments;
	/** Opinionated mode: push each model to commit to a single answer on open-ended
	 *  questions rather than hedge. Shapes the phase-1 answers and the synthesizer. */
	opinionated?: boolean;
	/** Collaborative mode: push debaters to weigh peers and lean toward convergence.
	 *  Only meaningful for Multi-Round Debate (where models see each other). */
	collaborative?: boolean;
	genericLabels?: boolean;
	signal?: AbortSignal;
	/** Tier label for stats annotation (purely informational; strategies don't branch on it). */
	tier?: string;
	/** Per-turn seed for peer-order randomization (which rival sits in slot A/B for
	 *  voting jurors and debate peers). When omitted, peers keep strict node order —
	 *  the path unit tests take. The server supplies a fresh random seed per request
	 *  so real runs rotate the seating and position bias washes out. */
	peerOrderSeed?: number;
	/** Multi-Round Debate only: the maximum number of critique/revise rounds before
	 *  the synthesizer writes the final answer. The debate still stops early on
	 *  convergence, so this is a ceiling. Clamped to the selectable range; omitted ⇒
	 *  [[DEFAULT_DEBATE_ROUNDS]]. Inert for every other strategy. */
	debateRounds?: number;
}

/** Selectable round counts for Multi-Round Debate's "Rounds" picker — each value
 *  is the maximum number of critique/revise rounds (the debate may converge
 *  sooner). Single source of truth shared by the picker, the request validator,
 *  and the debate runner's clamp. */
export const DEBATE_ROUND_OPTIONS = [2, 3, 4, 5] as const;
export const DEFAULT_DEBATE_ROUNDS = 3;
export const MIN_DEBATE_ROUNDS = DEBATE_ROUND_OPTIONS[0];
export const MAX_DEBATE_ROUNDS = DEBATE_ROUND_OPTIONS[DEBATE_ROUND_OPTIONS.length - 1];

export interface ConsensusStrategy {
	name: string;
	description: string;
	execute(ctx: ConsensusContext): AsyncIterable<ConsensusEvent>;
}

/** Markdown thematic break (`---`) used across the consensus strategies to
 *  separate sections: a system-prompt lens from the instructions that follow
 *  it, and a vote tally / debate transcript from the verbatim winning answer.
 *  Single source of truth so the strategies never drift out of sync. */
export const SECTION_RULE = '\n\n---\n\n';

// Ordered as shown in the strategy picker — cheapest first (`none` skips
// consensus entirely), flagship last.
export const STRATEGY_NAMES = ['none', 'synthesis', 'voting', 'debate'] as const;
export type StrategyName = (typeof STRATEGY_NAMES)[number];
// Synthesis loads by default — a fresh visitor's first run should be fast and
// reliable (one consensus call after the three nodes) rather than the most
// impressive. Debate is the fullest expression of the system but also the most
// expensive by every metric — slow on flaky free-tier models and ~3× the
// request budget per turn — so it's one click away instead of the first thing
// a new user waits on (changed from debate for the 1.0 public launch).
export const DEFAULT_STRATEGY: StrategyName = 'synthesis';
// The flagship strategy — the fullest expression of the three-MAGI system, given
// headline treatment in the picker (badge + RGB-triad accent). Distinct from the
// default: one drives initial state, the other the badge.
export const FLAGSHIP_STRATEGY: StrategyName = 'debate';

export const STRATEGY_LABELS: Record<StrategyName, string> = {
	none: 'None',
	synthesis: 'Synthesis',
	voting: 'Structured Voting',
	debate: 'Multi-Round Debate'
};

// Hover-explainer text for each strategy in the dropdown, so a first-time user
// can tell them apart without leaving for the README.
export const STRATEGY_DESCRIPTIONS: Record<StrategyName, string> = {
	none: 'Skip consensus entirely — the three model responses are shown side-by-side and nothing is synthesized. Useful for direct comparison without burning consensus tokens.',
	synthesis:
		'A consensus model reads all three responses and writes one unified answer — merging agreements, resolving conflicts, and flagging uncertainty.',
	voting:
		'Each model scores its peers’ answers (anonymized) 0–10. The highest-scoring response wins and is shown verbatim with a tally — no consensus model writes anything.',
	debate:
		'The full MAGI protocol: all three models read each other’s answers and revise across multiple rounds until they converge, then one synthesizes the final word. The most thorough — and the most expensive.'
};

/** Relative cost/thoroughness, 0–3, shown as a dot meter in the picker. `none`
 *  scores 0 (no consensus run at all). Abstract on purpose — the true call
 *  count shifts with node count and early-stop. */
export const STRATEGY_INTENSITY: Record<StrategyName, 0 | 1 | 2 | 3> = {
	none: 0,
	synthesis: 1,
	voting: 2,
	debate: 3
};
