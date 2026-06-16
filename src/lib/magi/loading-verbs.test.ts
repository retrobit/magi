import { describe, it, expect } from 'vitest';
import {
	loaderFrame,
	loaderCycleLength,
	LOADER_ELLIPSIS,
	SWEEP_CHAR,
	PAUSE_TICKS,
	GENERIC_VERBS,
	TEMPERAMENT_VERBS,
	STRATEGY_VERBS
} from './loading-verbs';

const ELL = LOADER_ELLIPSIS;
const NB = ' '; // the non-breaking blank used for padding/cleared columns
const BLOCK = SWEEP_CHAR;

describe('loaderFrame', () => {
	const verbs = ['Thinking', 'Pondering']; // tokens: "Thinking…" (9), "Pondering…" (10)
	const first = 'Thinking' + ELL;
	const second = 'Pondering' + ELL;

	it('writes the first verb onto blank, block hugging the live text', () => {
		expect(loaderFrame(verbs, 0, 0)).toBe(BLOCK);
		expect(loaderFrame(verbs, 0, 2)).toBe('Th' + BLOCK);
		// Block sits on the ellipsis position — the last glyph written.
		expect(loaderFrame(verbs, 0, first.length - 1)).toBe('Thinking' + BLOCK);
	});

	it('HOLD: shows the finished word through the pause window', () => {
		expect(loaderFrame(verbs, 0, first.length)).toBe(first);
		expect(loaderFrame(verbs, 0, first.length + PAUSE_TICKS - 1)).toBe(first);
	});

	it('overwrites the previous verb in place — old letters linger ahead of the block', () => {
		// index 1 replaces "Thinking…" with "Pondering…"; the outgoing tail shows ahead.
		expect(loaderFrame(verbs, 1, 0)).toBe(BLOCK + 'hinking' + ELL);
		expect(loaderFrame(verbs, 1, 2)).toBe('Po' + BLOCK + 'nking' + ELL);
		expect(loaderFrame(verbs, 1, second.length - 1)).toBe('Pondering' + BLOCK);
	});

	it('clears the leftover tail when the outgoing word is longer', () => {
		const shrink = ['Pondering', 'Mulling']; // "Pondering…" (10) → "Mulling…" (8)
		// Block has written the whole new word and now sweeps the old tail, blanking it.
		expect(loaderFrame(shrink, 1, 8)).toBe('Mulling' + ELL + BLOCK + ELL);
		expect(loaderFrame(shrink, 1, 9)).toBe('Mulling' + ELL + NB + BLOCK);
	});

	it('shows the plain verb + ellipsis with no animation when reduced', () => {
		expect(loaderFrame(verbs, 0, 3, true)).toBe(first);
		expect(loaderFrame(verbs, 1, 99, true)).toBe(second);
	});

	it('wraps the index around the verb list', () => {
		expect(loaderFrame(verbs, 2, 99, true)).toBe(first);
	});
});

describe('loaderCycleLength', () => {
	it('spans the wider of the incoming/outgoing word + the pause', () => {
		const verbs = ['Thinking', 'Pondering'];
		// index 0 has no previous → just the word length + pause.
		expect(loaderCycleLength(verbs, 0)).toBe(('Thinking' + ELL).length + PAUSE_TICKS);
		// index 1 overwrites "Thinking…" (9) with "Pondering…" (10) → wider wins.
		expect(loaderCycleLength(verbs, 1)).toBe(('Pondering' + ELL).length + PAUSE_TICKS);
		// Shrinking still spans the wider (old) word so its tail is fully cleared.
		const shrink = ['Pondering', 'Mulling'];
		expect(loaderCycleLength(shrink, 1)).toBe(('Pondering' + ELL).length + PAUSE_TICKS);
	});
});

describe('verb lists', () => {
	it('has a non-empty generic list and one per temperament/strategy', () => {
		expect(GENERIC_VERBS.length).toBeGreaterThan(0);
		expect(TEMPERAMENT_VERBS.rationalist.length).toBeGreaterThan(0);
		expect(TEMPERAMENT_VERBS.caretaker.length).toBeGreaterThan(0);
		expect(TEMPERAMENT_VERBS.individualist.length).toBeGreaterThan(0);
		expect(STRATEGY_VERBS.synthesis.length).toBeGreaterThan(0);
		expect(STRATEGY_VERBS.voting.length).toBeGreaterThan(0);
	});
});
