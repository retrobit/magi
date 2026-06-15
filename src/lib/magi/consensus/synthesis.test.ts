import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamText, type ModelMessage } from 'ai';
import { synthesisStrategy } from './synthesis';
import type { ConsensusContext, ConsensusEvent } from './types';
import type { NodeAssignment } from '../config';
import type { MagiResponse } from '../types';

vi.mock('ai', () => ({ streamText: vi.fn() }));

const streamTextMock = vi.mocked(streamText);

function fakeResult(
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

const assignments: NodeAssignment[] = [
	{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-x' },
	{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', modelId: 'gpt-x' },
	{ node: 'MAGI_3', gateway: 'google', provider: 'google', modelId: 'gemini-x' }
];

const responses: MagiResponse[] = [
	{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', text: 'Response A' },
	{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', text: 'Response B' },
	{ node: 'MAGI_3', gateway: 'google', provider: 'google', text: 'Response C' }
];

function baseContext(overrides: Partial<ConsensusContext> = {}): ConsensusContext {
	return {
		responses: [...responses],
		query: 'What is truth?',
		getModel: vi.fn(() => ({}) as never),
		nodeAssignments: assignments,
		consensusNodeIndex: 0,
		...overrides
	};
}

async function collect(iter: AsyncIterable<ConsensusEvent>): Promise<ConsensusEvent[]> {
	const out: ConsensusEvent[] = [];
	for await (const event of iter) out.push(event);
	return out;
}

function lastArgs() {
	const call = streamTextMock.mock.calls.at(-1);
	if (!call) throw new Error('streamText was not called');
	return call[0];
}

beforeEach(() => {
	streamTextMock.mockReset();
	streamTextMock.mockImplementation(() => fakeResult(['x']) as never);
});

describe('synthesisStrategy.execute', () => {
	it('streams text-delta events, then complete, then usage', async () => {
		streamTextMock.mockImplementation(() => fakeResult(['Hello', ' world']) as never);
		const events = await collect(synthesisStrategy.execute(baseContext()));
		expect(events).toEqual([
			{ type: 'text-delta', text: 'Hello' },
			{ type: 'text-delta', text: ' world' },
			{ type: 'complete', fullText: 'Hello world' },
			{ type: 'usage', inputTokens: 100, outputTokens: 50, cachedInputTokens: 10 },
			{
				type: 'run-stats',
				stats: {
					strategy: 'synthesis',
					tier: 'unknown',
					synthesizerAwareness: false,
					consensusTemperament: false,
					nodes: {
						MAGI_1: { gateway: 'anthropic', provider: 'anthropic', model: 'claude-x' },
						MAGI_2: { gateway: 'openai', provider: 'openai', model: 'gpt-x' },
						MAGI_3: { gateway: 'google', provider: 'google', model: 'gemini-x' }
					}
				}
			}
		]);
	});

	it('emits a run-stats event with no voting block (synthesis crowns no winner)', async () => {
		const events = await collect(synthesisStrategy.execute(baseContext({ tier: 'frontier' })));
		const e = events.find((ev) => ev.type === 'run-stats');
		if (!e || e.type !== 'run-stats') throw new Error('no run-stats event emitted');
		expect(e.stats.strategy).toBe('synthesis');
		expect(e.stats.tier).toBe('frontier');
		expect(e.stats.voting).toBeUndefined();
	});

	it('defaults missing usage figures to zero', async () => {
		streamTextMock.mockImplementation(
			() =>
				({
					textStream: (async function* () {
						yield 'x';
					})(),
					usage: Promise.resolve({})
				}) as never
		);
		const events = await collect(synthesisStrategy.execute(baseContext()));
		expect(events.find((e) => e.type === 'usage')).toEqual({
			type: 'usage',
			inputTokens: 0,
			outputTokens: 0,
			cachedInputTokens: 0
		});
	});

	it('builds the synthesizer model from the consensus node assignment', async () => {
		const getModel = vi.fn(() => ({}) as never);
		await collect(synthesisStrategy.execute(baseContext({ getModel, consensusNodeIndex: 1 })));
		expect(getModel).toHaveBeenCalledWith('openai', 'gpt-x');
	});

	it('embeds the query and every node response in the synthesis prompt', async () => {
		await collect(synthesisStrategy.execute(baseContext()));
		const messages = lastArgs().messages as ModelMessage[];
		const prompt = messages.at(-1)!.content as string;
		expect(prompt).toContain('Original query: What is truth?');
		expect(prompt).toContain('Response A');
		expect(prompt).toContain('Response B');
		expect(prompt).toContain('Response C');
	});

	it('replays prior consensus turns as user/assistant pairs before the synthesis prompt', async () => {
		await collect(
			synthesisStrategy.execute(
				baseContext({ history: [{ query: 'earlier question', consensus: 'earlier answer' }] })
			)
		);
		const messages = lastArgs().messages as ModelMessage[];
		expect(messages[0]).toMatchObject({ role: 'user', content: 'earlier question' });
		expect(messages[1]).toMatchObject({ role: 'assistant', content: 'earlier answer' });
		expect(messages).toHaveLength(3);
	});

	it('marks an Anthropic cache breakpoint on the final replayed message', async () => {
		await collect(synthesisStrategy.execute(baseContext()));
		const messages = lastArgs().messages as ModelMessage[];
		expect(messages.at(-1)!.providerOptions).toEqual({
			anthropic: { cacheControl: { type: 'ephemeral' } }
		});
	});

	it('forwards the abort signal to streamText', async () => {
		const signal = new AbortController().signal;
		await collect(synthesisStrategy.execute(baseContext({ signal })));
		expect(lastArgs().abortSignal).toBe(signal);
	});

	it('omits the dispositional-lens guidance when synthesizerAwareness is off', async () => {
		await collect(synthesisStrategy.execute(baseContext()));
		expect(lastArgs().system).not.toContain('dispositional lens');
	});

	it('adds dispositional-lens guidance to the system prompt when synthesizerAwareness is on', async () => {
		await collect(synthesisStrategy.execute(baseContext({ synthesizerAwareness: true })));
		expect(lastArgs().system).toContain('dispositional lens');
	});

	it('spells out the actual built-in lenses (truthful, not inferred) when awareness is on', async () => {
		await collect(synthesisStrategy.execute(baseContext({ synthesizerAwareness: true })));
		const system = lastArgs().system as string;
		expect(system).toContain('Rationalist');
		expect(system).toContain('Caretaker');
		expect(system).toContain('Individualist');
	});

	it('uses a custom temperament label + persona in the lens roster and response tags', async () => {
		await collect(
			synthesisStrategy.execute(
				baseContext({
					synthesizerAwareness: true,
					customTemperaments: { MAGI_1: { label: 'Skeptic', prompt: 'You doubt every claim.' } }
				})
			)
		);
		const system = lastArgs().system as string;
		// The actual custom lens is named, not the built-in Rationalist.
		expect(system).toContain('Skeptic');
		expect(system).toContain('You doubt every claim.');
		// The per-response tag in the user message is also tagged with the custom label.
		const messages = lastArgs().messages as ModelMessage[];
		const lastUser = messages[messages.length - 1].content as string;
		expect(lastUser).toContain('Skeptic');
	});

	it('starts the system prompt with the consensus role text when no consensus temperament is set', async () => {
		await collect(synthesisStrategy.execute(baseContext()));
		expect((lastArgs().system as string).startsWith('You are the MAGI consensus system')).toBe(
			true
		);
	});

	it('prepends the node temperament ahead of the role text when consensusTemperament is on', async () => {
		await collect(synthesisStrategy.execute(baseContext({ consensusTemperament: true })));
		const system = lastArgs().system as string;
		expect(system.startsWith('You are the MAGI consensus system')).toBe(false);
		expect(system).toContain('You are the MAGI consensus system');
	});

	it('describes a partial set in the system prompt when fewer than three models responded', async () => {
		const ctx = baseContext();
		ctx.responses = responses.slice(0, 2);
		await collect(synthesisStrategy.execute(ctx));
		expect(lastArgs().system).toContain('2 of three');
	});

	it('names the unavailable MAGI in the synthesis prompt when one is missing', async () => {
		const ctx = baseContext();
		// MAGI_1 + MAGI_2 respond, MAGI_3 does not.
		ctx.responses = responses.slice(0, 2);
		await collect(synthesisStrategy.execute(ctx));
		const messages = lastArgs().messages as ModelMessage[];
		const prompt = messages.at(-1)!.content as string;
		expect(prompt).toContain('Unavailable for this query:');
		expect(prompt).toContain('MAGI • 3');
		expect(prompt).toMatch(/do not let absent MAGI vanish silently/i);
	});

	it('uses generic labels for unavailable MAGI when genericLabels is true', async () => {
		const ctx = baseContext({ genericLabels: true });
		ctx.responses = responses.slice(0, 2);
		await collect(synthesisStrategy.execute(ctx));
		const messages = lastArgs().messages as ModelMessage[];
		const prompt = messages.at(-1)!.content as string;
		expect(prompt).toContain('Unavailable for this query:');
		expect(prompt).not.toContain('MAGI_3');
	});

	it('omits the missing-node clause when every MAGI responded', async () => {
		await collect(synthesisStrategy.execute(baseContext()));
		const messages = lastArgs().messages as ModelMessage[];
		const prompt = messages.at(-1)!.content as string;
		expect(prompt).not.toContain('Unavailable for this query:');
	});
});
