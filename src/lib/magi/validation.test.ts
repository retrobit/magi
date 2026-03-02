import { describe, it, expect } from 'vitest';
import { magiRequestSchema } from './validation';

describe('magiRequestSchema', () => {
	it('accepts a valid request', () => {
		const result = magiRequestSchema.safeParse({
			query: 'What is the meaning of life?',
			tier: 'balanced',
			strategy: 'synthesis'
		});
		expect(result.success).toBe(true);
	});

	it('rejects an empty query', () => {
		const result = magiRequestSchema.safeParse({
			query: '',
			tier: 'balanced',
			strategy: 'synthesis'
		});
		expect(result.success).toBe(false);
	});

	it('rejects a missing query', () => {
		const result = magiRequestSchema.safeParse({
			tier: 'balanced',
			strategy: 'synthesis'
		});
		expect(result.success).toBe(false);
	});

	it('rejects an invalid tier', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'free',
			strategy: 'synthesis'
		});
		expect(result.success).toBe(false);
	});

	it('rejects an invalid strategy', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'voting'
		});
		expect(result.success).toBe(false);
	});

	it('rejects a query exceeding max length', () => {
		const result = magiRequestSchema.safeParse({
			query: 'x'.repeat(10_001),
			tier: 'balanced',
			strategy: 'synthesis'
		});
		expect(result.success).toBe(false);
	});

	it('accepts all valid tiers', () => {
		for (const tier of ['frontier', 'balanced', 'budget']) {
			const result = magiRequestSchema.safeParse({
				query: 'test',
				tier,
				strategy: 'synthesis'
			});
			expect(result.success).toBe(true);
		}
	});

	it('accepts an optional consensusProvider', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'synthesis',
			consensusProvider: 'openai'
		});
		expect(result.success).toBe(true);
	});

	it('rejects an invalid consensusProvider', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'synthesis',
			consensusProvider: 'invalid'
		});
		expect(result.success).toBe(false);
	});
});
