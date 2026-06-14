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
	MAGI_NODES,
	type TemperamentName
} from './types';

describe('TEMPERAMENT_NAMES', () => {
	it('defines exactly three temperaments', () => {
		expect(TEMPERAMENT_NAMES).toHaveLength(3);
	});

	it('contains the canonical temperament names', () => {
		expect([...TEMPERAMENT_NAMES]).toEqual(['rationalist', 'caretaker', 'individualist']);
	});
});

describe('TEMPERAMENT_LABELS', () => {
	it('has a label for every temperament', () => {
		for (const name of TEMPERAMENT_NAMES) {
			expect(TEMPERAMENT_LABELS[name]).toBeTruthy();
		}
	});

	it('labels are capitalized display names', () => {
		expect(TEMPERAMENT_LABELS.rationalist).toBe('Rationalist');
		expect(TEMPERAMENT_LABELS.caretaker).toBe('Caretaker');
		expect(TEMPERAMENT_LABELS.individualist).toBe('Individualist');
	});
});

describe('NODE_TEMPERAMENTS', () => {
	it('assigns a temperament to every MAGI node', () => {
		for (const node of MAGI_NODE_NAMES) {
			expect(TEMPERAMENT_NAMES).toContain(NODE_TEMPERAMENTS[node]);
		}
	});

	it('assigns unique temperaments across nodes', () => {
		const assigned = MAGI_NODE_NAMES.map((n) => NODE_TEMPERAMENTS[n]);
		expect(new Set(assigned).size).toBe(3);
	});

	it('maps the canonical assignments', () => {
		expect(NODE_TEMPERAMENTS.MELCHIOR).toBe('rationalist');
		expect(NODE_TEMPERAMENTS.BALTHASAR).toBe('caretaker');
		expect(NODE_TEMPERAMENTS.CASPAR).toBe('individualist');
	});
});

describe('MAGI_NODES', () => {
	it('includes temperament on each node', () => {
		for (const node of MAGI_NODES) {
			expect(node.temperament).toBeTruthy();
			expect(TEMPERAMENT_NAMES).toContain(node.temperament);
		}
	});

	it('node temperaments match NODE_TEMPERAMENTS mapping', () => {
		for (const node of MAGI_NODES) {
			expect(node.temperament).toBe(NODE_TEMPERAMENTS[node.name]);
		}
	});
});

describe('TEMPERAMENT_SYSTEM_PROMPTS', () => {
	it('has a prompt for every temperament', () => {
		for (const name of TEMPERAMENT_NAMES) {
			expect(TEMPERAMENT_SYSTEM_PROMPTS[name]).toBeTruthy();
		}
	});

	it('each prompt is a non-trivial string', () => {
		for (const name of TEMPERAMENT_NAMES) {
			expect(TEMPERAMENT_SYSTEM_PROMPTS[name].length).toBeGreaterThan(50);
		}
	});

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
		const def = defaultNodeTemperament('MELCHIOR');
		expect(def.base).toBe('rationalist');
		expect(def.label).toBe(TEMPERAMENT_LABELS.rationalist);
		expect(def.prompt).toBe(TEMPERAMENT_SYSTEM_PROMPTS.rationalist);
		expect(def.description).toBe(TEMPERAMENT_TOOLTIPS.rationalist);
	});
});

describe('resolveNodeTemperament', () => {
	it('falls back to the built-in when there is no override', () => {
		const r = resolveNodeTemperament('CASPAR');
		expect(r.custom).toBe(false);
		expect(r.label).toBe(TEMPERAMENT_LABELS.individualist);
		expect(r.prompt).toBe(TEMPERAMENT_SYSTEM_PROMPTS.individualist);
		// A built-in uses its curated gloss, not the raw persona, as the description.
		expect(r.description).toBe(TEMPERAMENT_TOOLTIPS.individualist);
	});

	it('applies an override and marks it custom', () => {
		const r = resolveNodeTemperament('MELCHIOR', {
			MELCHIOR: { label: 'Skeptic', prompt: 'You doubt everything.' }
		});
		expect(r.custom).toBe(true);
		expect(r.label).toBe('Skeptic');
		expect(r.prompt).toBe('You doubt everything.');
		// A custom temperament surfaces its own persona as the badge description.
		expect(r.description).toBe('You doubt everything.');
	});

	it('fills a blank field from the built-in (half-filled override stays usable)', () => {
		const r = resolveNodeTemperament('BALTHASAR', {
			BALTHASAR: { label: 'Guardian', prompt: '   ' }
		});
		expect(r.label).toBe('Guardian');
		expect(r.prompt).toBe(TEMPERAMENT_SYSTEM_PROMPTS.caretaker);
		expect(r.custom).toBe(true);
	});

	it('treats an override equal to the default as not custom', () => {
		const def = defaultNodeTemperament('CASPAR');
		const r = resolveNodeTemperament('CASPAR', {
			CASPAR: { label: def.label, prompt: def.prompt }
		});
		expect(r.custom).toBe(false);
	});
});
