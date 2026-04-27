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
			tier: 'premium',
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
		for (const tier of ['frontier', 'balanced', 'budget', 'free']) {
			const result = magiRequestSchema.safeParse({
				query: 'test',
				tier,
				strategy: 'synthesis'
			});
			expect(result.success).toBe(true);
		}
	});

	it('accepts an optional consensusNode', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'synthesis',
			consensusNode: 'MELCHIOR'
		});
		expect(result.success).toBe(true);
	});

	it('accepts all valid consensusNode values', () => {
		for (const node of ['MELCHIOR', 'BALTHASAR', 'CASPAR']) {
			const result = magiRequestSchema.safeParse({
				query: 'test',
				tier: 'balanced',
				strategy: 'synthesis',
				consensusNode: node
			});
			expect(result.success).toBe(true);
		}
	});

	it('rejects an invalid consensusNode', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'synthesis',
			consensusNode: 'INVALID'
		});
		expect(result.success).toBe(false);
	});

	it('accepts temperaments as true', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'synthesis',
			temperaments: true
		});
		expect(result.success).toBe(true);
	});

	it('accepts temperaments as false', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'synthesis',
			temperaments: false
		});
		expect(result.success).toBe(true);
	});

	it('accepts request without temperaments (defaults to undefined)', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'synthesis'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.temperaments).toBeUndefined();
		}
	});

	it('rejects non-boolean temperaments', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'synthesis',
			temperaments: 'yes'
		});
		expect(result.success).toBe(false);
	});
});
