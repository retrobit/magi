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

describe('loaderFrame', () => {
	const verbs = ['Thinking', 'Pondering'];
	const ELL = LOADER_ELLIPSIS;
	const NB = ' '; // the non-breaking blank the delete phase leaves behind
	const word = 'Thinking' + ELL; // length 9
	const L = word.length;

	it('WRITE: lays the verb (ellipsis included) down up to the block', () => {
		expect(loaderFrame(verbs, 0, 0)).toBe(SWEEP_CHAR);
		expect(loaderFrame(verbs, 0, 2)).toBe('Th' + SWEEP_CHAR);
		// Block sits on the ellipsis position — the last glyph written.
		expect(loaderFrame(verbs, 0, L - 1)).toBe('Thinking' + SWEEP_CHAR);
	});

	it('HOLD: shows the finished word through the pause window', () => {
		expect(loaderFrame(verbs, 0, L)).toBe(word);
		expect(loaderFrame(verbs, 0, L + PAUSE_TICKS - 1)).toBe(word);
	});

	it('DELETE: forward-deletes left-to-right, blanks trailing behind the block', () => {
		expect(loaderFrame(verbs, 0, L + PAUSE_TICKS)).toBe(SWEEP_CHAR + 'hinking' + ELL);
		expect(loaderFrame(verbs, 0, L + PAUSE_TICKS + 1)).toBe(NB + SWEEP_CHAR + 'inking' + ELL);
		// Final delete frame: only blanks and the block remain.
		expect(loaderFrame(verbs, 0, 2 * L + PAUSE_TICKS - 1)).toBe(NB.repeat(L - 1) + SWEEP_CHAR);
	});

	it('shows the plain verb + ellipsis with no animation when reduced', () => {
		expect(loaderFrame(verbs, 0, 3, true)).toBe(word);
		expect(loaderFrame(verbs, 1, 99, true)).toBe('Pondering' + ELL);
	});

	it('wraps the index around the verb list', () => {
		expect(loaderFrame(verbs, 2, 99, true)).toBe(word);
	});
});

describe('loaderCycleLength', () => {
	it('is write (len) + hold (pause) + delete (len) for the verb + ellipsis', () => {
		const verbs = ['Thinking', 'Pondering'];
		const a = ('Thinking' + LOADER_ELLIPSIS).length; // 9
		const b = ('Pondering' + LOADER_ELLIPSIS).length; // 10
		expect(loaderCycleLength(verbs, 0)).toBe(2 * a + PAUSE_TICKS);
		expect(loaderCycleLength(verbs, 1)).toBe(2 * b + PAUSE_TICKS);
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
