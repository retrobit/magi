import { describe, it, expect } from 'vitest';
import { MAGI_NODES, MAGI_NODE_NAMES, TIER_NAMES, PROVIDER_NAMES } from './types';

describe('MAGI_NODES', () => {
	it('defines exactly three nodes', () => {
		expect(MAGI_NODES).toHaveLength(3);
	});

	it('uses the canonical MAGI names', () => {
		const names = MAGI_NODES.map((n) => n.name);
		expect(names).toEqual(['MELCHIOR', 'BALTHASAR', 'CASPAR']);
	});
});

describe('MAGI_NODE_NAMES', () => {
	it('matches MAGI_NODES', () => {
		expect([...MAGI_NODE_NAMES]).toEqual(MAGI_NODES.map((n) => n.name));
	});
});

describe('TIER_NAMES', () => {
	it('defines three tiers', () => {
		expect(TIER_NAMES).toEqual(['frontier', 'balanced', 'budget']);
	});
});

describe('PROVIDER_NAMES', () => {
	it('defines three providers', () => {
		expect(PROVIDER_NAMES).toEqual(['anthropic', 'openai', 'google']);
	});
});
