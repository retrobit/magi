import { describe, it, expect } from 'vitest';
import { getStrategy, getAvailableStrategies } from './index';

describe('getStrategy', () => {
	it('returns the synthesis strategy', () => {
		const strategy = getStrategy('synthesis');
		expect(strategy).toBeDefined();
		expect(strategy.name).toBe('synthesis');
	});
});

describe('getAvailableStrategies', () => {
	it('returns all registered strategies', () => {
		const strategies = getAvailableStrategies();
		expect(strategies).toHaveLength(1);
		expect(strategies[0]).toEqual({
			name: 'synthesis',
			description: expect.any(String)
		});
	});
});
