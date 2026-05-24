import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateText, streamText } from 'ai';
import { debateStrategy } from './debate';
import type { ConsensusContext, ConsensusEvent } from './types';
import type { NodeAssignment } from '../config';
import type { MagiResponse } from '../types';

vi.mock('ai', () => ({ generateText: vi.fn(), streamText: vi.fn() }));

const generateTextMock = vi.mocked(generateText);
const streamTextMock = vi.mocked(streamText);

const assignments: NodeAssignment[] = [
	{ node: 'MELCHIOR', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-x' },
	{ node: 'BALTHASAR', gateway: 'openai', provider: 'openai', modelId: 'gpt-x' },
	{ node: 'CASPAR', gateway: 'google', provider: 'google', modelId: 'gemini-x' }
];

const threeResponses: MagiResponse[] = [
	{ node: 'MELCHIOR', gateway: 'anthropic', provider: 'anthropic', text: 'Answer from MELCHIOR' },
	{ node: 'BALTHASAR', gateway: 'openai', provider: 'openai', text: 'Answer from BALTHASAR' },
	{ node: 'CASPAR', gateway: 'google', provider: 'google', text: 'Answer from CASPAR' }
];

function context(overrides: Partial<ConsensusContext> = {}): ConsensusContext {
	return {
		responses: threeResponses,
		query: 'What is the best approach?',
		getModel: vi.fn(() => ({}) as never),
		nodeAssignments: assignments,
		consensusNodeIndex: 0,
		...overrides
	};
}

// A debater's structured reply: CHANGED flag, one-line NOTE, full revised ANSWER.
function debaterReply(
	changed: 'yes' | 'no',
	answer = 'A revised answer',
	note = 'tightened the reasoning',
	usage = { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 }
) {
	return { text: `CHANGED: ${changed}\nNOTE: ${note}\nANSWER:\n${answer}`, usage };
}

// A streamed synthesis result, matching the `ai` streamText shape.
function fakeStream(
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

async function collect(iter: AsyncIterable<ConsensusEvent>): Promise<ConsensusEvent[]> {
	const out: ConsensusEvent[] = [];
	for await (const event of iter) out.push(event);
	return out;
}

function completeText(events: ConsensusEvent[]): string {
	const e = events.find((ev) => ev.type === 'complete');
	if (!e || e.type !== 'complete') throw new Error('no complete event emitted');
	return e.fullText;
}

beforeEach(() => {
	generateTextMock.mockReset();
	streamTextMock.mockReset();
	streamTextMock.mockImplementation(() => fakeStream(['final ']) as never);
});

describe('debateStrategy.execute', () => {
	it('streams the transcript, then the final answer, ending in run-stats', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		streamTextMock.mockImplementation(() => fakeStream(['Hello', ' world']) as never);

		const events = await collect(debateStrategy.execute(context()));
		const types = events.map((e) => e.type);

		expect(types[0]).toBe('text-delta');
		expect(types.slice(-3)).toEqual(['complete', 'usage', 'run-stats']);

		const text = completeText(events);
		expect(text).toContain('🗣️ Multi-Round Debate');
		expect(text).toContain('**Round 1**');
		// Divider then the streamed synthesis make up the final answer.
		expect(text).toContain('---');
		expect(text).toContain('Hello world');
	});

	it('runs up to MAX_ROUNDS while debaters keep changing', async () => {
		// Every debater reports a material change every round → no convergence.
		generateTextMock.mockResolvedValue(debaterReply('yes') as never);
		await collect(debateStrategy.execute(context()));
		// 3 debaters × 3 rounds = 9 debater calls, plus one synthesis stream.
		expect(generateTextMock).toHaveBeenCalledTimes(9);
		expect(streamTextMock).toHaveBeenCalledTimes(1);
	});

	it('early-stops the moment a round produces no material change', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		await collect(debateStrategy.execute(context()));
		// Round 1 yields all "no" → converged → stop. 3 debater calls only.
		expect(generateTextMock).toHaveBeenCalledTimes(3);
	});

	it('treats a missing CHANGED flag as a change (keeps debating)', async () => {
		// No CHANGED line → conservative default is "changed", so it never converges.
		generateTextMock.mockResolvedValue({
			text: 'ANSWER:\nstill thinking about it',
			usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 }
		} as never);
		await collect(debateStrategy.execute(context()));
		expect(generateTextMock).toHaveBeenCalledTimes(9);
	});

	it('sums token usage across every debater call and the final synthesis', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never); // 1 round, 3 calls
		const events = await collect(debateStrategy.execute(context()));
		// Debaters: 3 × {10,5,0} = {30,15,0}. Synthesis: {100,50,10}.
		expect(events.find((e) => e.type === 'usage')).toEqual({
			type: 'usage',
			inputTokens: 130,
			outputTokens: 65,
			cachedInputTokens: 10
		});
	});

	it('skips the debate when only one node responded and synthesizes directly', async () => {
		const events = await collect(
			debateStrategy.execute(context({ responses: threeResponses.slice(0, 1) }))
		);
		expect(generateTextMock).not.toHaveBeenCalled();
		expect(streamTextMock).toHaveBeenCalledTimes(1);
		expect(completeText(events)).toContain('no debate was held');
	});

	it('builds the final synthesis from the consensus node assignment', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		const getModel = vi.fn(() => ({}) as never);
		await collect(debateStrategy.execute(context({ getModel, consensusNodeIndex: 1 })));
		// The synthesis call is last — it must target BALTHASAR's model.
		expect(getModel.mock.calls.at(-1)).toEqual(['openai', 'gpt-x']);
		expect(String(streamTextMock.mock.calls.at(-1)?.[0].system)).toContain('MAGI consensus system');
	});

	it('forwards the abort signal to every debater and the synthesis', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		const signal = new AbortController().signal;
		await collect(debateStrategy.execute(context({ signal })));
		for (const call of generateTextMock.mock.calls) {
			expect(call[0].abortSignal).toBe(signal);
		}
		expect(streamTextMock.mock.calls.at(-1)?.[0].abortSignal).toBe(signal);
	});

	it('gives each debater its own temperament lens when the MAGI are in-character', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		await collect(debateStrategy.execute(context({ nodeTemperaments: true })));
		// Debaters run in node order — MELCHIOR (Rationalist), BALTHASAR (Caretaker),
		// CASPAR (Individualist). Each prompt carries that debater's lens only.
		const prompts = generateTextMock.mock.calls.map((c) => String(c[0].prompt));
		expect(prompts[0]).toContain('Rationalist aspect');
		expect(prompts[1]).toContain('Caretaker aspect');
		// A debater is never told a peer's disposition — anonymity holds.
		expect(prompts[0]).not.toContain('Caretaker');
	});

	it('surfaces each round to its node panel via node-round events', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no', 'CASPAR revised text') as never);
		const events = await collect(debateStrategy.execute(context()));
		const rounds = events.filter((e) => e.type === 'node-round');
		// One round (converged) × three debaters.
		expect(rounds).toHaveLength(3);
		for (const r of rounds) {
			if (r.type !== 'node-round') throw new Error('unreachable');
			expect(r.entry.round).toBe(1);
			expect(r.entry.response).toBe('CASPAR revised text');
			// Trimmed inputs surface the node's prior answer + its anonymized peers.
			expect(r.entry.prompt).toContain('Your previous answer');
			expect(r.entry.prompt).toContain('Peer A');
		}
		// The three responding nodes are each represented exactly once.
		const nodes = rounds.map((r) => (r.type === 'node-round' ? r.node : null));
		expect(new Set(nodes)).toEqual(new Set(['MELCHIOR', 'BALTHASAR', 'CASPAR']));
	});

	it('builds the round ledger from the CHANGED flag (revised / held)', async () => {
		// MELCHIOR holds, the other two revise → ledger names both groups, no NOTE.
		generateTextMock
			.mockResolvedValueOnce(debaterReply('no') as never)
			.mockResolvedValueOnce(debaterReply('yes') as never)
			.mockResolvedValueOnce(debaterReply('yes') as never)
			// Round 2: everyone holds → converged.
			.mockResolvedValue(debaterReply('no') as never);
		const events = await collect(debateStrategy.execute(context({ genericLabels: true })));
		const text = events.find((e) => e.type === 'complete');
		if (!text || text.type !== 'complete') throw new Error('no complete');
		expect(text.fullText).toContain('revised');
		expect(text.fullText).toContain('held');
		expect(text.fullText).toContain('Converged');
		// The per-node NOTE is surfaced in the ledger for a quick overview.
		expect(text.fullText).toContain('tightened the reasoning');
	});

	it('keeps the final synthesizer neutral even when consensusTemperament is set', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		await collect(debateStrategy.execute(context({ consensusTemperament: true })));
		// Debaters get a lens (verified elsewhere), but the synthesizer must not —
		// its system prompt carries no dispositional lens text.
		const system = String(streamTextMock.mock.calls.at(-1)?.[0].system);
		expect(system).toContain('consolidate, not to add a new perspective');
		expect(system).not.toContain('aspect');
	});

	it('opens the ledger with each node’s initial position', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		const events = await collect(debateStrategy.execute(context({ genericLabels: true })));
		const text = events.find((e) => e.type === 'complete');
		if (!text || text.type !== 'complete') throw new Error('no complete');
		expect(text.fullText).toContain('Initial positions');
		// Each responding node appears in the opening summary, before Round 1.
		const introIdx = text.fullText.indexOf('Initial positions');
		const round1Idx = text.fullText.indexOf('**Round 1**');
		expect(introIdx).toBeGreaterThanOrEqual(0);
		expect(introIdx).toBeLessThan(round1Idx);
		expect(text.fullText).toContain('Answer from MELCHIOR');
	});

	it('emits a debate run-stats record with no voting block', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		const events = await collect(debateStrategy.execute(context({ tier: 'frontier' })));
		const e = events.find((ev) => ev.type === 'run-stats');
		if (!e || e.type !== 'run-stats') throw new Error('no run-stats event emitted');
		expect(e.stats.strategy).toBe('debate');
		expect(e.stats.tier).toBe('frontier');
		expect(e.stats.voting).toBeUndefined();
		expect(e.stats.nodes.MELCHIOR).toEqual({
			gateway: 'anthropic',
			provider: 'anthropic',
			model: 'claude-x'
		});
	});
});
