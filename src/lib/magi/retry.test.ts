import { describe, it, expect } from 'vitest';
import { assembleRetryPriors } from './retry';
import type { NodeAssignment } from './config';
import type { ConversationTurn } from './types';

const ASSIGNMENTS: [NodeAssignment, NodeAssignment, NodeAssignment] = [
	{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-x' },
	{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', modelId: 'gpt-x' },
	{ node: 'MAGI_3', gateway: 'google', provider: 'google', modelId: 'gemini-x' }
];

function turn(over: Partial<ConversationTurn> = {}): ConversationTurn {
	return {
		query: 'Q',
		nodeResponses: {},
		nodeErrors: {},
		consensus: '',
		consensusNode: 'MAGI_1',
		nodeUsage: {},
		...over
	};
}

describe('assembleRetryPriors', () => {
	it('carries surviving answers as both rehydrated responses and server priors', () => {
		const last = turn({
			nodeResponses: { MAGI_1: 'mel failed-then-empty', MAGI_2: 'bal ok', MAGI_3: 'cas ok' },
			nodeErrors: { MAGI_1: 'boom' },
			nodeUsage: {
				MAGI_2: { inputTokens: 10, outputTokens: 5 },
				MAGI_3: { inputTokens: 7, outputTokens: 3 }
			}
		});
		const out = assembleRetryPriors(last, ASSIGNMENTS, 'MAGI_1');

		// MAGI_1 (the retried node) is omitted from every list.
		expect(out.responses.map((r) => r.node)).toEqual(['MAGI_2', 'MAGI_3']);
		expect(out.priorResponses).toEqual([
			{ node: 'MAGI_2', text: 'bal ok' },
			{ node: 'MAGI_3', text: 'cas ok' }
		]);
		expect(out.modelErrors).toEqual([]);
		expect(out.carriedUsage).toEqual({
			MAGI_2: { inputTokens: 10, outputTokens: 5 },
			MAGI_3: { inputTokens: 7, outputTokens: 3 }
		});
		// Rehydrated responses keep their gateway/provider identity.
		expect(out.responses[0]).toMatchObject({ gateway: 'openai', provider: 'openai' });
	});

	it('keeps other failed nodes failed — only the retried node re-runs', () => {
		const last = turn({
			nodeResponses: { MAGI_3: 'cas ok' },
			nodeErrors: { MAGI_1: 'mel boom', MAGI_2: 'bal boom' }
		});
		const out = assembleRetryPriors(last, ASSIGNMENTS, 'MAGI_1');

		// MAGI_2 also failed → stays in modelErrors, never becomes a prior.
		expect(out.modelErrors).toEqual([
			{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', error: 'bal boom' }
		]);
		expect(out.responses.map((r) => r.node)).toEqual(['MAGI_3']);
		expect(out.priorResponses).toEqual([{ node: 'MAGI_3', text: 'cas ok' }]);
	});

	it('omits survivors with no recorded usage from carriedUsage', () => {
		const last = turn({
			nodeResponses: { MAGI_2: 'bal ok', MAGI_3: 'cas ok' },
			nodeUsage: { MAGI_2: { inputTokens: 4, outputTokens: 2 } }
		});
		const out = assembleRetryPriors(last, ASSIGNMENTS, 'MAGI_1');
		expect(out.carriedUsage).toEqual({ MAGI_2: { inputTokens: 4, outputTokens: 2 } });
		expect('MAGI_3' in out.carriedUsage).toBe(false);
	});
});
