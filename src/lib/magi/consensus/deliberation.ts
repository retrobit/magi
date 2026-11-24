import type { ModelMessage } from 'ai';
import { markCacheBreakpoint } from '../prompt-cache';
import { NODE_LABELS, NODE_LABELS_GENERIC } from '../types';
import type { MagiNodeName } from '../types';
import {
	nodeIdentities,
	type ConsensusContext,
	type ConsensusHistoryTurn,
	type RunStats,
	type StrategyName
} from './types';

/** Optional deliberation directives, appended to model prompts when the matching
 *  toggle is on. Single-sourced so the phase-1 dispatch, the debate rounds, and
 *  the synthesizer all speak with one voice.
 *
 *  Opinionated — push each model to commit to a single answer on open-ended
 *  questions instead of hedging or listing equally-weighted options.
 *  Collaborative — push debaters to weigh their peers and lean toward genuine
 *  convergence (without caving). Only meaningful where models see each other,
 *  i.e. Multi-Round Debate. */
export const OPINIONATED_DIRECTIVE =
	'If this question is open-ended or has many defensible answers, do not hedge, equivocate, or present a ranked list of equally-weighted options. Commit to a single, specific answer and argue for it directly. You may acknowledge the strongest alternative in one sentence, but take a clear, definite position.';

export const COLLABORATIVE_DIRECTIVE =
	'Approach this as a collaboration aimed at convergence, not a contest. Engage your peers’ reasoning in good faith and move toward a shared answer when they make the better case — the goal is genuine agreement on the strongest answer. But do not be a pushover: hold a well-grounded position when the argument warrants it, and never agree merely to agree. Seek the strongest common ground over a hollow compromise.';

/** Names the MAGI that did not respond, so the synthesizer can acknowledge the
 *  gap in its reply — readers expect three perspectives, and a silent
 *  two-of-three consensus reads as if nothing went wrong. `context` is the run's
 *  noun ("query" for synthesis/voting, "debate" for the debate path). Returns an
 *  empty string when every MAGI responded. Single-sourced so synthesis and debate
 *  word the absence identically. */
export function missingClause(missingLabels: string[], context: string): string {
	if (missingLabels.length === 0) return '';
	const one = missingLabels.length === 1;
	return `\n\nUnavailable for this ${context}: ${missingLabels.join(', ')}. Acknowledge ${
		one ? 'this absence' : 'these absences'
	} briefly so the reader knows the consensus is missing ${
		one ? 'a perspective' : 'perspectives'
	} — do not let absent MAGI vanish silently.`;
}

/** Per-call deadline for the non-streamed inner calls (debate rounds, voting
 *  jurors). They run in parallel under the one consensus stall guard, which only
 *  resets when the strategy yields — so without their own cap a single hung call
 *  burns the whole window and discards its siblings' work. Must stay below
 *  CONSENSUS_STALL_TIMEOUT_MS (90 s, src/routes/api/magi/+server.ts) so a hung seat
 *  times out alone and the strategy degrades as it does on any rejection. 80 s, not
 *  less: thinking models can legitimately take over a minute on a non-streamed answer. */
export const CONSENSUS_CALL_TIMEOUT_MS = 80_000;

/** The request signal combined with the per-call deadline. */
export function callSignal(signal?: AbortSignal): AbortSignal {
	const deadline = AbortSignal.timeout(CONSENSUS_CALL_TIMEOUT_MS);
	return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

/** Default to numbered labels; proper names only on an explicit opt-in (the
 *  reveal path), so node names stay de-lored everywhere by default. */
export function labelsFor(genericLabels?: boolean): Record<MagiNodeName, string> {
	return genericLabels === false ? NODE_LABELS : NODE_LABELS_GENERIC;
}

/** Labels of the assigned nodes that did not respond — named so the synthesizer
 *  can acknowledge them in the reply. Feed to [[missingClause]]. */
export function absentLabels(
	ctx: Pick<ConsensusContext, 'responses' | 'nodeAssignments'>,
	labels: Record<MagiNodeName, string>
): string[] {
	return ctx.nodeAssignments
		.filter((a) => !ctx.responses.some((r) => r.node === a.node))
		.map((a) => labels[a.node]);
}

/** The run-stats envelope every strategy shares; each adds its own block. */
export function baseRunStats(ctx: ConsensusContext, strategy: StrategyName): RunStats {
	return {
		strategy,
		tier: ctx.tier ?? 'unknown',
		synthesizerAwareness: ctx.synthesizerAwareness ?? false,
		consensusTemperament: ctx.consensusTemperament ?? false,
		nodes: nodeIdentities(ctx.responses, ctx.nodeAssignments)
	};
}

/** Replay prior consensus turns, then the current prompt, so follow-ups
 *  ("expand on that") stay coherent. Past turns carry only the bare question +
 *  consensus; the current turn carries the full prompt with this round's fresh
 *  responses. The last message gets the cache breakpoint (a no-op for
 *  non-Anthropic gateways). */
export function consensusThread(history: ConsensusHistoryTurn[], prompt: string): ModelMessage[] {
	const messages: ModelMessage[] = [];
	for (const turn of history) {
		// A failed or aborted turn commits with an empty consensus — skip the
		// pair rather than replay an empty assistant message, which some
		// providers reject outright.
		if (!turn.consensus) continue;
		messages.push({ role: 'user', content: turn.query });
		messages.push({ role: 'assistant', content: turn.consensus });
	}
	messages.push({ role: 'user', content: prompt });
	markCacheBreakpoint(messages);
	return messages;
}

/** Normalise an AI SDK usage report into the three figures the stream carries.
 *  Confines the SDK's deprecated `cachedInputTokens` to this one read. */
export function toUsage(u?: {
	inputTokens?: number;
	outputTokens?: number;
	inputTokenDetails?: { cacheReadTokens?: number };
	cachedInputTokens?: number;
}): { inputTokens: number; outputTokens: number; cachedInputTokens: number } {
	return {
		inputTokens: u?.inputTokens ?? 0,
		outputTokens: u?.outputTokens ?? 0,
		cachedInputTokens: u?.inputTokenDetails?.cacheReadTokens ?? u?.cachedInputTokens ?? 0
	};
}
