// Shared fixtures for the consensus strategy tests (synthesis, voting, debate).
import { vi } from 'vitest';
import type { ConsensusContext, ConsensusEvent } from './types';
import type { NodeAssignment } from '../config';
import type { MagiResponse } from '../types';

export const assignments: NodeAssignment[] = [
	{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-x' },
	{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', modelId: 'gpt-x' },
	{ node: 'MAGI_3', gateway: 'google', provider: 'google', modelId: 'gemini-x' }
];

export const threeResponses: MagiResponse[] = [
	{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', text: 'Answer from MAGI_1' },
	{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', text: 'Answer from MAGI_2' },
	{ node: 'MAGI_3', gateway: 'google', provider: 'google', text: 'Answer from MAGI_3' }
];

/** A three-seat context; override any field (each suite sets its own query). */
export function consensusContext(overrides: Partial<ConsensusContext> = {}): ConsensusContext {
	return {
		responses: threeResponses,
		query: 'Which answer is best?',
		getModel: vi.fn(() => ({}) as never),
		nodeAssignments: assignments,
		consensusNodeIndex: 0,
		...overrides
	};
}

export async function collect(iter: AsyncIterable<ConsensusEvent>): Promise<ConsensusEvent[]> {
	const out: ConsensusEvent[] = [];
	for await (const event of iter) out.push(event);
	return out;
}

/** A streamed result, matching the `ai` streamText shape. */
export function fakeStream(
	chunks: string[],
	usage = { inputTokens: 100, outputTokens: 50, cachedInputTokens: 10 }
) {
	return {
		textStream: (async function* () {
			for (const c of chunks) yield c;
		})(),
		usage: Promise.resolve(usage)
	};
}

/** The `fullText` of the strategy's `complete` event. */
export function completeText(events: ConsensusEvent[]): string {
	const e = events.find((ev) => ev.type === 'complete');
	if (!e || e.type !== 'complete') throw new Error('no complete event emitted');
	return e.fullText;
}

/** A generateText mock that never settles on its own: it rejects when the
 *  forwarded abort signal fires, as a real hung provider call would. */
export function hangUntilAborted(options: { abortSignal?: AbortSignal }): Promise<never> {
	return new Promise((_, reject) => {
		options.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason));
	});
}

/** Replace `AbortSignal.timeout` with controllable signals, one per call, so a
 *  test can fire a single call's deadline without waiting. Call `restore()` after. */
export function captureDeadlines() {
	const controllers: AbortController[] = [];
	const requested: number[] = [];
	const spy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
		requested.push(ms);
		const c = new AbortController();
		controllers.push(c);
		return c.signal;
	});
	return {
		requested,
		/** Fire the nth call's deadline. */
		expire: (n: number) => controllers[n].abort(new Error('deadline')),
		restore: () => spy.mockRestore()
	};
}
