import { describe, it, expect } from 'vitest';
import { TEMPERAMENT_SYSTEM_PROMPTS } from './temperaments';
import {
	TEMPERAMENT_NAMES,
	TEMPERAMENT_LABELS,
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
