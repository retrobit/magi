import { describe, it, expect } from 'vitest';
import {
	TEMPERAMENT_SYSTEM_PROMPTS,
	defaultNodeTemperament,
	resolveNodeTemperament
} from './temperaments';
import {
	TEMPERAMENT_NAMES,
	TEMPERAMENT_LABELS,
	TEMPERAMENT_TOOLTIPS,
	NODE_TEMPERAMENTS,
	MAGI_NODE_NAMES,
	type TemperamentName
} from './types';

describe('NODE_TEMPERAMENTS', () => {
	it('assigns unique temperaments across nodes', () => {
		const assigned = MAGI_NODE_NAMES.map((n) => NODE_TEMPERAMENTS[n]);
		expect(new Set(assigned).size).toBe(3);
	});
});

describe('TEMPERAMENT_SYSTEM_PROMPTS', () => {
	it('prompts are unique across temperaments', () => {
		const prompts = Object.values(TEMPERAMENT_SYSTEM_PROMPTS);
		expect(new Set(prompts).size).toBe(3);
	});

	it('each prompt references the MAGI system', () => {
		for (const name of TEMPERAMENT_NAMES) {
			expect(TEMPERAMENT_SYSTEM_PROMPTS[name]).toContain('MAGI');
		}
	});

	it('each prompt references its own temperament identity', () => {
		const expectedKeywords: Record<TemperamentName, string> = {
			rationalist: 'Rationalist',
			caretaker: 'Caretaker',
			individualist: 'Individualist'
		};
		for (const name of TEMPERAMENT_NAMES) {
			expect(TEMPERAMENT_SYSTEM_PROMPTS[name]).toContain(expectedKeywords[name]);
		}
	});
});

describe('defaultNodeTemperament', () => {
	it('returns the built-in label, persona, and gloss for a node', () => {
		const def = defaultNodeTemperament('MAGI_1');
		expect(def.base).toBe('rationalist');
		expect(def.label).toBe(TEMPERAMENT_LABELS.rationalist);
		expect(def.prompt).toBe(TEMPERAMENT_SYSTEM_PROMPTS.rationalist);
		expect(def.description).toBe(TEMPERAMENT_TOOLTIPS.rationalist);
	});
});

describe('resolveNodeTemperament', () => {
	it('falls back to the built-in when there is no override', () => {
		const r = resolveNodeTemperament('MAGI_3');
		expect(r.custom).toBe(false);
		expect(r.label).toBe(TEMPERAMENT_LABELS.individualist);
		expect(r.prompt).toBe(TEMPERAMENT_SYSTEM_PROMPTS.individualist);
		// A built-in uses its curated gloss, not the raw persona, as the description.
		expect(r.description).toBe(TEMPERAMENT_TOOLTIPS.individualist);
	});

	it('applies an override and marks it custom', () => {
		const r = resolveNodeTemperament('MAGI_1', {
			MAGI_1: { label: 'Skeptic', prompt: 'You doubt everything.' }
		});
		expect(r.custom).toBe(true);
		expect(r.label).toBe('Skeptic');
		expect(r.prompt).toBe('You doubt everything.');
		// A custom temperament surfaces its own persona as the badge description.
		expect(r.description).toBe('You doubt everything.');
	});

	it('fills a blank field from the built-in (half-filled override stays usable)', () => {
		const r = resolveNodeTemperament('MAGI_2', {
			MAGI_2: { label: 'Guardian', prompt: '   ' }
		});
		expect(r.label).toBe('Guardian');
		expect(r.prompt).toBe(TEMPERAMENT_SYSTEM_PROMPTS.caretaker);
		expect(r.custom).toBe(true);
	});

	it('treats an override equal to the default as not custom', () => {
		const def = defaultNodeTemperament('MAGI_3');
		const r = resolveNodeTemperament('MAGI_3', {
			MAGI_3: { label: def.label, prompt: def.prompt }
		});
		expect(r.custom).toBe(false);
	});
});
