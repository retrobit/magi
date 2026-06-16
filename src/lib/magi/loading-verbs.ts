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

// A solid block is the writing head, à la Claude Code. Each verb REPLACES the one
// before it in place as the block sweeps left-to-right: behind the block the new
// verb (ellipsis included) is laid down, ahead of it the outgoing verb's letters
// linger until the block reaches and overwrites them ("█ondering…" → "Po█dering…"
// → "Pondering…"). When the outgoing word is LONGER, the block keeps sweeping past
// the new word's end to clear the leftover tail (blanks behind it); when the new
// word is longer or the same it just writes onto blank — there's nothing to clear.
// After the sweep the finished word holds for a beat, then the next verb sweeps in.
// The very first verb writes onto a blank line.
export const SWEEP_CHAR = '█';
export const SWEEP_MS = 70;
// Ticks the finished word is held (block gone) before the next verb sweeps in.
// Generous so the eye rests on each word — the sweep is motion, the hold is breath.
export const PAUSE_TICKS = 18;
// The trailing ellipsis rides along as part of the verb, written and cleared with it.
export const LOADER_ELLIPSIS = '…';
// A non-breaking space for the blank columns. A normal space would be collapsed by
// HTML whitespace handling and let the block slide left; nbsp holds its column.
const BLANK = ' ';

const token = (verbs: readonly string[], index: number): string =>
	verbs[index % verbs.length] + LOADER_ELLIPSIS;

/**
 * One frame of the block replacing `prevWord` with `word`: the new word laid down
 * up to the block, the block, then whatever's left of the outgoing word ahead of
 * it (blank for the first verb). Both are padded to the wider of the two with
 * non-breaking blanks, so a shorter incoming word clears the outgoing tail as the
 * block passes and a longer one writes onto blank. Past the swept span it's the
 * plain word — the pause. Trailing blanks are trimmed so the "…" hugs the live text.
 */
function replaceFrame(word: string, sweep: number, prevWord: string): string {
	const width = Math.max(word.length, prevWord.length);
	if (sweep >= width) return word;
	const incoming = word.padEnd(width, BLANK);
	const outgoing = prevWord.padEnd(width, BLANK);
	return (incoming.slice(0, sweep) + SWEEP_CHAR + outgoing.slice(sweep + 1)).trimEnd();
}

/**
 * The loader line for the current frame. `sweep` runs 0 → loaderCycleLength()-1
 * across the active verb's REPLACE → HOLD phases. When `reduced` is true
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
	// The first verb writes onto blank; every later verb overwrites its predecessor.
	const prev = index === 0 ? '' : token(verbs, index - 1);
	return replaceFrame(word, sweep, prev);
}

/** Ticks in one verb's cycle: the swept span (wider of the two words) + the pause. */
export function loaderCycleLength(verbs: readonly string[], index: number): number {
	const prev = index === 0 ? '' : token(verbs, index - 1);
	return Math.max(token(verbs, index).length, prev.length) + PAUSE_TICKS;
}
