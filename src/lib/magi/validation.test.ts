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
			strategy: 'not-a-strategy'
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
			consensusNode: 'MAGI_1'
		});
		expect(result.success).toBe(true);
	});

	it('accepts all valid consensusNode values', () => {
		for (const node of ['MAGI_1', 'MAGI_2', 'MAGI_3']) {
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

	it('accepts a sparse customTemperaments map', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'synthesis',
			temperaments: true,
			customTemperaments: { MAGI_1: { label: 'Skeptic', prompt: 'You doubt everything.' } }
		});
		expect(result.success).toBe(true);
	});

	it('rejects a customTemperaments prompt over the cap', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'synthesis',
			customTemperaments: { MAGI_3: { label: 'X', prompt: 'y'.repeat(5000) } }
		});
		expect(result.success).toBe(false);
	});

	it('rejects a customTemperaments key that is not a node name', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'synthesis',
			customTemperaments: { NOTANODE: { label: 'X', prompt: 'y' } }
		});
		expect(result.success).toBe(false);
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

describe('magiRequestSchema — retry surface', () => {
	function base(extra: Record<string, unknown> = {}) {
		return magiRequestSchema.safeParse({
			query: 'Hello MAGI',
			tier: 'balanced',
			strategy: 'synthesis',
			...extra
		});
	}

	it('accepts a valid payload with forceRetry, retryNodes, and priorResponses', () => {
		const result = base({
			forceRetry: true,
			retryNodes: ['MAGI_1'],
			priorResponses: [{ node: 'MAGI_2', text: 'x' }]
		});
		expect(result.success).toBe(true);
	});

	it('rejects retryNodes with an invalid node name', () => {
		expect(base({ retryNodes: ['INVALID'] }).success).toBe(false);
	});

	it('rejects 4-element priorResponses (max is 3)', () => {
		const four = [
			{ node: 'MAGI_1', text: 'a' },
			{ node: 'MAGI_2', text: 'b' },
			{ node: 'MAGI_3', text: 'c' },
			{ node: 'MAGI_1', text: 'd' }
		];
		expect(base({ priorResponses: four }).success).toBe(false);
	});

	it('rejects a priorResponses text of 50_001 chars', () => {
		const result = base({
			priorResponses: [{ node: 'MAGI_1', text: 'x'.repeat(50_001) }]
		});
		expect(result.success).toBe(false);
	});

	it('rejects non-boolean forceRetry', () => {
		expect(base({ forceRetry: 'yes' }).success).toBe(false);
	});
});

describe('magiRequestSchema — history', () => {
	const validTurn = {
		query: 'prior question',
		nodeResponses: [
			{ node: 'MAGI_1', text: 'first answer' },
			{ node: 'MAGI_2', text: 'second answer' }
		],
		consensus: 'prior consensus'
	};

	function withHistory(history: unknown) {
		return magiRequestSchema.safeParse({
			query: 'follow-up',
			tier: 'balanced',
			strategy: 'synthesis',
			history
		});
	}

	it('accepts a valid history array', () => {
		expect(withHistory([validTurn]).success).toBe(true);
	});

	it('accepts an empty history array', () => {
		expect(withHistory([]).success).toBe(true);
	});

	it('accepts a request without history (defaults to undefined)', () => {
		const result = magiRequestSchema.safeParse({
			query: 'hello',
			tier: 'balanced',
			strategy: 'synthesis'
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.history).toBeUndefined();
	});

	it('accepts a turn with an empty nodeResponses array', () => {
		expect(withHistory([{ ...validTurn, nodeResponses: [] }]).success).toBe(true);
	});

	it('accepts a history at the 50-turn cap', () => {
		expect(withHistory(Array(50).fill(validTurn)).success).toBe(true);
	});

	it('rejects a history exceeding 50 turns', () => {
		expect(withHistory(Array(51).fill(validTurn)).success).toBe(false);
	});

	it('rejects a non-array history', () => {
		expect(withHistory('not an array').success).toBe(false);
	});

	it('rejects a turn with an empty query', () => {
		expect(withHistory([{ ...validTurn, query: '' }]).success).toBe(false);
	});

	it('rejects a turn with a query exceeding max length', () => {
		expect(withHistory([{ ...validTurn, query: 'x'.repeat(10_001) }]).success).toBe(false);
	});

	it('rejects a turn missing nodeResponses', () => {
		const { nodeResponses, ...rest } = validTurn;
		void nodeResponses;
		expect(withHistory([rest]).success).toBe(false);
	});

	it('rejects a turn missing consensus', () => {
		const { consensus, ...rest } = validTurn;
		void consensus;
		expect(withHistory([rest]).success).toBe(false);
	});

	it('rejects a nodeResponse with an invalid node name', () => {
		const result = withHistory([
			{ ...validTurn, nodeResponses: [{ node: 'INVALID', text: 'answer' }] }
		]);
		expect(result.success).toBe(false);
	});

	it('rejects a nodeResponse text exceeding 50k chars', () => {
		const result = withHistory([
			{ ...validTurn, nodeResponses: [{ node: 'MAGI_1', text: 'x'.repeat(50_001) }] }
		]);
		expect(result.success).toBe(false);
	});

	it('rejects a consensus exceeding 50k chars', () => {
		expect(withHistory([{ ...validTurn, consensus: 'x'.repeat(50_001) }]).success).toBe(false);
	});

	it('rejects a turn whose nodeResponses has 4 entries (max is 3)', () => {
		const four = [
			{ node: 'MAGI_1', text: 'a' },
			{ node: 'MAGI_2', text: 'b' },
			{ node: 'MAGI_3', text: 'c' },
			{ node: 'MAGI_1', text: 'd' }
		];
		expect(withHistory([{ ...validTurn, nodeResponses: four }]).success).toBe(false);
	});
});
