import { describe, it, expect } from 'vitest';
import { getStrategy, getAvailableStrategies } from './index';

describe('getStrategy', () => {
	it('returns the synthesis strategy', () => {
		const strategy = getStrategy('synthesis');
		expect(strategy).toBeDefined();
		expect(strategy.name).toBe('synthesis');
	});

	it('returns the voting strategy', () => {
		const strategy = getStrategy('voting');
		expect(strategy).toBeDefined();
		expect(strategy.name).toBe('voting');
	});

	it('returns the debate strategy', () => {
		const strategy = getStrategy('debate');
		expect(strategy).toBeDefined();
		expect(strategy.name).toBe('debate');
	});
});

describe('getAvailableStrategies', () => {
	it('returns every registered strategy with a description', () => {
		const strategies = getAvailableStrategies();
		expect(strategies.map((s) => s.name)).toEqual(['synthesis', 'voting', 'debate']);
		for (const strategy of strategies) {
			expect(strategy.description).toEqual(expect.any(String));
		}
	});
});
