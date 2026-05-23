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
	it('places the block at the sweep position, replacing that character', () => {
		expect(sweepVerb('Thinking', 0)).toBe('█hinking');
		expect(sweepVerb('Thinking', 2)).toBe('Th█nking');
		expect(sweepVerb('Thinking', 7)).toBe('Thinkin█');
	});

	it('keeps the word the same length (one char swapped for the block)', () => {
		for (let i = 0; i < 'Pondering'.length; i++) {
			expect(sweepVerb('Pondering', i)).toHaveLength('Pondering'.length);
			expect(sweepVerb('Pondering', i)).toContain(SWEEP_CHAR);
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
