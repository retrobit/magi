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

// A solid block is the writing head: it sweeps left-to-right and lays the verb
// down behind it, one character at a time, à la Claude Code. The very first verb
// is written onto blank ("█      " → "Th█    " → "Thinking"); every verb after
// overwrites the *previous* word in place as the block passes — the outgoing
// letters stay on screen ahead of the block until it reaches them ("█ondering" →
// "Po█dering" → "Pondering"), and a shorter new word erases the tail with spaces.
// After it reaches the end it holds the full word for a beat, then the next sweep
// begins. Widths are padded with spaces so the line stays steady in the mono font.
export const SWEEP_CHAR = '█';
export const SWEEP_MS = 70;
// Ticks the full word is held (block gone) before advancing to the next verb.
// Generous so the eye rests on each completed word rather than the cycle
// feeling frantic — the sweep is the motion, the hold is the breath.
export const PAUSE_TICKS = 18;

/**
 * The line mid-sweep: the incoming `word` laid down up to the block at `sweep`,
 * the block itself, then whatever's left of the outgoing `prevWord` ahead of it
 * (blank on the first verb). Once `sweep` clears the swept span it's the plain
 * word — the trailing pause. Both words are padded to the wider of the two so a
 * shorter incoming word erases the outgoing tail with spaces and the width holds.
 */
export function sweepVerb(word: string, sweep: number, prevWord = ''): string {
	const width = Math.max(word.length, prevWord.length);
	if (sweep >= width) return word;
	const incoming = word.padEnd(width, ' ');
	const outgoing = prevWord.padEnd(width, ' ');
	return incoming.slice(0, sweep) + SWEEP_CHAR + outgoing.slice(sweep + 1);
}

/**
 * Total ticks for one verb: one per swept column (the wider of the incoming and
 * outgoing words, so a longer previous word is fully overwritten), then the pause.
 */
export function sweepCycleLength(word: string, prevWord = ''): number {
	return Math.max(word.length, prevWord.length) + PAUSE_TICKS;
}
