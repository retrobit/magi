import { describe, it, expect } from 'vitest';
import {
	sweepVerb,
	sweepCycleLength,
	loaderFrame,
	loaderCycleLength,
	LOADER_ELLIPSIS,
	SWEEP_CHAR,
	PAUSE_TICKS,
	GENERIC_VERBS,
	TEMPERAMENT_VERBS,
	STRATEGY_VERBS
} from './loading-verbs';

describe('sweepVerb', () => {
	it('writes the first verb onto blank (no previous word)', () => {
		expect(sweepVerb('Thinking', 0)).toBe('█       ');
		expect(sweepVerb('Thinking', 2)).toBe('Th█     ');
		expect(sweepVerb('Thinking', 7)).toBe('Thinkin█');
	});

	it('overwrites the previous word, which stays visible ahead of the block', () => {
		// Pondering (9) → Mulling: outgoing letters remain until the block reaches them.
		expect(sweepVerb('Mulling', 0, 'Pondering')).toBe('█ondering');
		expect(sweepVerb('Mulling', 2, 'Pondering')).toBe('Mu█dering');
		// A shorter incoming word erases the outgoing tail with spaces.
		expect(sweepVerb('Mulling', 7, 'Pondering')).toBe('Mulling█g');
		expect(sweepVerb('Mulling', 8, 'Pondering')).toBe('Mulling █');
	});

	it('keeps the line padded to the wider of the two words', () => {
		const width = Math.max('Mulling'.length, 'Pondering'.length);
		for (let i = 0; i < width; i++) {
			expect(sweepVerb('Mulling', i, 'Pondering')).toHaveLength(width);
			expect(sweepVerb('Mulling', i, 'Pondering')).toContain(SWEEP_CHAR);
		}
	});

	it('shows the plain word (no block) once sweep reaches the end — the pause', () => {
		expect(sweepVerb('Reasoning', 'Reasoning'.length)).toBe('Reasoning');
		expect(sweepVerb('Reasoning', 'Reasoning'.length + 3)).toBe('Reasoning');
	});
});

describe('sweepCycleLength', () => {
	it('is the word length plus the trailing pause', () => {
		expect(sweepCycleLength('abc')).toBe(3 + PAUSE_TICKS);
		expect(sweepCycleLength('Tallying')).toBe('Tallying'.length + PAUSE_TICKS);
	});

	it('spans the wider word so a longer previous one is fully overwritten', () => {
		expect(sweepCycleLength('Mulling', 'Pondering')).toBe('Pondering'.length + PAUSE_TICKS);
		expect(sweepCycleLength('Pondering', 'Mulling')).toBe('Pondering'.length + PAUSE_TICKS);
	});
});

describe('loaderFrame', () => {
	const verbs = ['Thinking', 'Pondering'];

	it('writes the ellipsis as part of the swept token', () => {
		// Frame just before the pause: the whole verb is laid down and the block
		// sits on the ellipsis position, so the ellipsis is being written too.
		const token = 'Thinking' + LOADER_ELLIPSIS; // length 9 (0..8)
		expect(loaderFrame(verbs, 0, 8)).toBe('Thinking' + SWEEP_CHAR);
		// The pause frame shows the verb WITH its ellipsis — no static suffix needed.
		expect(loaderFrame(verbs, 0, token.length)).toBe('Thinking' + LOADER_ELLIPSIS);
	});

	it('trims the to-be-filled padding so the line ends at the live content', () => {
		// Mid-write of the first verb (onto blank): block hugged, no trailing spaces.
		expect(loaderFrame(verbs, 0, 2)).toBe('Th' + SWEEP_CHAR);
	});

	it('shows the plain verb + ellipsis with no sweep when reduced', () => {
		expect(loaderFrame(verbs, 0, 3, true)).toBe('Thinking' + LOADER_ELLIPSIS);
		expect(loaderFrame(verbs, 1, 99, true)).toBe('Pondering' + LOADER_ELLIPSIS);
	});

	it('wraps the index around the verb list', () => {
		expect(loaderFrame(verbs, 2, 99, true)).toBe('Thinking' + LOADER_ELLIPSIS);
	});
});

describe('loaderCycleLength', () => {
	it('counts the ellipsis in the cycle (and the wider neighbouring token)', () => {
		const verbs = ['Thinking', 'Pondering'];
		// index 0 has no previous token → just "Thinking…" (9) + pause.
		expect(loaderCycleLength(verbs, 0)).toBe(('Thinking' + LOADER_ELLIPSIS).length + PAUSE_TICKS);
		// index 1 overwrites "Thinking…" (9) with "Pondering…" (10) → wider wins.
		expect(loaderCycleLength(verbs, 1)).toBe(('Pondering' + LOADER_ELLIPSIS).length + PAUSE_TICKS);
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
