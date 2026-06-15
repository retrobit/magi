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

// A solid block is the writing head, à la Claude Code. Only one verb is ever on
// screen, and it lives through three phases:
//   WRITE   the block lays the verb (ellipsis included) down left-to-right onto
//           a blank line ("█" → "Th█" → "Thinking█" → "Thinking…"),
//   HOLD    the finished word rests for a beat,
//   DELETE  the block forward-deletes the word left-to-right, eating one char per
//           tick and leaving blanks behind ("█hinking…" → " █inking…" → "      █"),
// then the next verb writes onto the now-clear line. No overwrite, no padding —
// the line only ever holds the one live word.
export const SWEEP_CHAR = '█';
export const SWEEP_MS = 70;
// Ticks the finished word is held (block gone) before it's deleted. Generous so
// the eye rests on each completed word — the sweep is motion, the hold is breath.
export const PAUSE_TICKS = 18;
// The trailing ellipsis is written and deleted as part of the verb, not tacked on.
export const LOADER_ELLIPSIS = '…';
// A non-breaking space for the deleted columns: a normal leading space would be
// collapsed by HTML whitespace handling and let the block slide back to the left.
const BLANK = ' ';

const token = (verbs: readonly string[], index: number): string =>
	verbs[index % verbs.length] + LOADER_ELLIPSIS;

/**
 * The loader line for the current frame. `sweep` runs 0 → loaderCycleLength()-1
 * across the active verb's WRITE → HOLD → DELETE phases. When `reduced` is true
 * (prefers-reduced-motion) it's just the plain verb + ellipsis, no animation.
 */
export function loaderFrame(
	verbs: readonly string[],
	index: number,
	sweep: number,
	reduced = false
): string {
	const word = token(verbs, index);
	if (reduced) return word;
	const len = word.length;
	// WRITE: the word laid down up to the block; the rest isn't written yet.
	if (sweep < len) return word.slice(0, sweep) + SWEEP_CHAR;
	// HOLD: the finished word, ellipsis and all.
	if (sweep < len + PAUSE_TICKS) return word;
	// DELETE: the block eats the word left-to-right, blanks trailing behind it.
	const erased = sweep - len - PAUSE_TICKS;
	return BLANK.repeat(erased) + SWEEP_CHAR + word.slice(erased + 1);
}

/** Ticks in one verb's cycle: write (len) + hold (pause) + delete (len). */
export function loaderCycleLength(verbs: readonly string[], index: number): number {
	return 2 * token(verbs, index).length + PAUSE_TICKS;
}
