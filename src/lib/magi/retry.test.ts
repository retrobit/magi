import { describe, it, expect } from 'vitest';
import { assembleRetryPriors } from './retry';
import type { NodeAssignment } from './config';
import type { ConversationTurn } from './types';

const ASSIGNMENTS: [NodeAssignment, NodeAssignment, NodeAssignment] = [
	{ node: 'MELCHIOR', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-x' },
	{ node: 'BALTHASAR', gateway: 'openai', provider: 'openai', modelId: 'gpt-x' },
	{ node: 'CASPAR', gateway: 'google', provider: 'google', modelId: 'gemini-x' }
];

function turn(over: Partial<ConversationTurn> = {}): ConversationTurn {
	return {
		query: 'Q',
		nodeResponses: {},
		nodeErrors: {},
		consensus: '',
		consensusNode: 'MELCHIOR',
		nodeUsage: {},
		...over
	};
}

describe('assembleRetryPriors', () => {
	it('carries surviving answers as both rehydrated responses and server priors', () => {
		const last = turn({
			nodeResponses: { MELCHIOR: 'mel failed-then-empty', BALTHASAR: 'bal ok', CASPAR: 'cas ok' },
			nodeErrors: { MELCHIOR: 'boom' },
			nodeUsage: {
				BALTHASAR: { inputTokens: 10, outputTokens: 5 },
				CASPAR: { inputTokens: 7, outputTokens: 3 }
			}
		});
		const out = assembleRetryPriors(last, ASSIGNMENTS, 'MELCHIOR');

		// MELCHIOR (the retried node) is omitted from every list.
		expect(out.responses.map((r) => r.node)).toEqual(['BALTHASAR', 'CASPAR']);
		expect(out.priorResponses).toEqual([
			{ node: 'BALTHASAR', text: 'bal ok' },
			{ node: 'CASPAR', text: 'cas ok' }
		]);
		expect(out.modelErrors).toEqual([]);
		expect(out.carriedUsage).toEqual({
			BALTHASAR: { inputTokens: 10, outputTokens: 5 },
			CASPAR: { inputTokens: 7, outputTokens: 3 }
		});
		// Rehydrated responses keep their gateway/provider identity.
		expect(out.responses[0]).toMatchObject({ gateway: 'openai', provider: 'openai' });
	});

	it('keeps other failed nodes failed — only the retried node re-runs', () => {
		const last = turn({
			nodeResponses: { CASPAR: 'cas ok' },
			nodeErrors: { MELCHIOR: 'mel boom', BALTHASAR: 'bal boom' }
		});
		const out = assembleRetryPriors(last, ASSIGNMENTS, 'MELCHIOR');

		// BALTHASAR also failed → stays in modelErrors, never becomes a prior.
		expect(out.modelErrors).toEqual([
			{ node: 'BALTHASAR', gateway: 'openai', provider: 'openai', error: 'bal boom' }
		]);
		expect(out.responses.map((r) => r.node)).toEqual(['CASPAR']);
		expect(out.priorResponses).toEqual([{ node: 'CASPAR', text: 'cas ok' }]);
	});

	it('omits survivors with no recorded usage from carriedUsage', () => {
		const last = turn({
			nodeResponses: { BALTHASAR: 'bal ok', CASPAR: 'cas ok' },
			nodeUsage: { BALTHASAR: { inputTokens: 4, outputTokens: 2 } }
		});
		const out = assembleRetryPriors(last, ASSIGNMENTS, 'MELCHIOR');
		expect(out.carriedUsage).toEqual({ BALTHASAR: { inputTokens: 4, outputTokens: 2 } });
		expect('CASPAR' in out.carriedUsage).toBe(false);
	});
});
