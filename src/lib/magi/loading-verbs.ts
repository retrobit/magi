// Playful rotating loading verbs, à la Claude Code — shown beside the spinner
// while a node waits for its first token, or while the consensus is being
// produced. Node lists lean into each temperament; the consensus list leans
// into the active strategy. Purely cosmetic flavor.

import type { TemperamentName } from './types';
import type { StrategyName } from './consensus/types';

// Used when temperaments are off (no dispositional lens to flavor the verbs).
export const GENERIC_VERBS = ['Thinking', 'Pondering', 'Reasoning', 'Considering', 'Mulling'];

export const TEMPERAMENT_VERBS: Record<TemperamentName, string[]> = {
	rationalist: ['Calculating', 'Analyzing', 'Deducing', 'Weighing the data', 'Cross-checking'],
	caretaker: ['Considering', 'Empathizing', 'Weighing the impact', 'Reflecting', 'Caring'],
	individualist: ['Pondering', 'Feeling it out', 'Imagining', 'Following a hunch', 'Riffing']
};

// `none` skips the consensus call entirely — no loader runs, so there are no
// verbs to flavor. Narrowed to the dispatchable strategies; callers fall back
// to GENERIC_VERBS for `none`.
export const STRATEGY_VERBS: Record<Exclude<StrategyName, 'none'>, string[]> = {
	synthesis: ['Synthesizing', 'Reconciling', 'Weighing', 'Distilling', 'Composing'],
	voting: ['Tallying', 'Scoring', 'Counting', 'Deliberating', 'Judging'],
	debate: ['Debating', 'Arguing', 'Deliberating', 'Rebutting', 'Converging']
};

// A solid block sweeps left-to-right *through* the verb, replacing one
// character at a time ("Th█nking" → "Thi█king" → …), à la Claude Code. After it
// reaches the end it holds the full word for a beat, then the next verb sweeps.
export const SWEEP_CHAR = '█';
export const SWEEP_MS = 70;
// Ticks the full word is held (block gone) before advancing to the next verb.
// Generous so the eye rests on each completed word rather than the cycle
// feeling frantic — the sweep is the motion, the hold is the breath.
export const PAUSE_TICKS = 18;

/** The verb with a block at `sweep`, or the plain word during the trailing pause. */
export function sweepVerb(word: string, sweep: number): string {
	if (sweep < word.length) return word.slice(0, sweep) + SWEEP_CHAR + word.slice(sweep + 1);
	return word;
}

/** Total ticks for one verb: one per character, then the pause. */
export function sweepCycleLength(word: string): number {
	return word.length + PAUSE_TICKS;
}
