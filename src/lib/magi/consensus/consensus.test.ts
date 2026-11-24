import { describe, it, expect } from 'vitest';
import { getStrategy } from './index';
import { synthesisStrategy } from './synthesis';
import { votingStrategy } from './voting';
import { debateStrategy } from './debate';

describe('getStrategy', () => {
	it('returns the synthesis strategy', () => {
		expect(getStrategy('synthesis')).toBe(synthesisStrategy);
	});

	it('returns the voting strategy', () => {
		expect(getStrategy('voting')).toBe(votingStrategy);
	});

	it('returns the debate strategy', () => {
		expect(getStrategy('debate')).toBe(debateStrategy);
	});
});
