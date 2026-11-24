import { describe, it, expect } from 'vitest';
import { committedUsage, latestCommittedConsensusInput, latestCommittedNodeInput } from './usage';
import type { ConversationTurn } from './types';

function turn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
	return {
		query: 'q',
		nodeResponses: {},
		nodeErrors: {},
		consensus: '',
		consensusNode: 'MAGI_1',
		nodeUsage: {},
		...overrides
	};
}

describe('committedUsage', () => {
	it('is zero for an empty conversation', () => {
		expect(committedUsage([])).toEqual({ input: 0, output: 0 });
	});

	it('sums every node and the consensus across all turns', () => {
		const turns = [
			turn({
				nodeUsage: {
					MAGI_1: { inputTokens: 10, outputTokens: 5 },
					MAGI_3: { inputTokens: 20, outputTokens: 7 }
				},
				consensusUsage: { inputTokens: 100, outputTokens: 40 }
			}),
			// An errored node reports no usage; a turn without a consensus adds none.
			turn({ nodeUsage: { MAGI_2: { inputTokens: 1, outputTokens: 2 } } })
		];
		expect(committedUsage(turns)).toEqual({ input: 131, output: 54 });
	});
});

describe('latestCommittedNodeInput', () => {
	it('returns 0 with no usage for that node', () => {
		expect(latestCommittedNodeInput([], 'MAGI_1')).toBe(0);
		expect(
			latestCommittedNodeInput(
				[turn({ nodeUsage: { MAGI_2: { inputTokens: 9, outputTokens: 1 } } })],
				'MAGI_1'
			)
		).toBe(0);
	});

	it('takes the newest turn that has usage, skipping turns where the node errored', () => {
		const turns = [
			turn({ nodeUsage: { MAGI_1: { inputTokens: 11, outputTokens: 1 } } }),
			turn({ nodeUsage: { MAGI_1: { inputTokens: 22, outputTokens: 1 } } }),
			turn({ nodeUsage: {} })
		];
		expect(latestCommittedNodeInput(turns, 'MAGI_1')).toBe(22);
	});
});

describe('latestCommittedConsensusInput', () => {
	it('returns 0 when no turn has consensus usage', () => {
		expect(latestCommittedConsensusInput([turn()])).toBe(0);
	});

	it('takes the newest turn that has consensus usage', () => {
		const turns = [
			turn({ consensusUsage: { inputTokens: 50, outputTokens: 1 } }),
			turn({ consensusUsage: { inputTokens: 75, outputTokens: 1 } }),
			turn()
		];
		expect(latestCommittedConsensusInput(turns)).toBe(75);
	});
});
