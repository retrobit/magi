import { describe, it, expect } from 'vitest';
import {
	sweepVerb,
	sweepCycleLength,
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
