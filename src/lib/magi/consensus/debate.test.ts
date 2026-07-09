import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateText, streamText } from 'ai';
import {
	debateStrategy,
	extractInitialSummary,
	stripSummaryTail,
	parseDebaterReply
} from './debate';
import { seededShuffle } from './peer-order';
import type { ConsensusContext, ConsensusEvent } from './types';
import type { NodeAssignment } from '../config';
import type { MagiResponse } from '../types';

vi.mock('ai', () => ({ generateText: vi.fn(), streamText: vi.fn() }));

describe('parseDebaterReply', () => {
	const clean = 'CHANGED: no\nAGREE: yes\nNOTE: aligned\nANSWER:\nMy final answer.';

	it('parses a well-formed reply', () => {
		const r = parseDebaterReply(clean, 'prior', 1);
		expect(r.changed).toBe(false);
		expect(r.answer).toBe('My final answer.');
		expect(r.agree).toEqual([true]);
		expect(r.note).toBe('aligned');
	});

	it('does not capture reply scaffolding when prose contains the label words mid-line', () => {
		// The labels are anchored to line start; an unanchored regex would match
		// "answer" in the prose and swallow CHANGED/AGREE/NOTE as the answer.
		const text =
			"Let me answer this and I've changed my view.\nCHANGED: yes\nAGREE: no\nNOTE: I reconsidered the answer\nANSWER:\n42 is correct.";
		const r = parseDebaterReply(text, 'prior', 1);
		expect(r.answer).toBe('42 is correct.');
		expect(r.changed).toBe(true);
		expect(r.agree).toEqual([false]);
	});

	it('leaves a mixed unlabelled stance ambiguous rather than pinning one answer to all peers', () => {
		// "A: yes, B: no" without the word "Peer" → per-peer parse misses; the bare
		// fallback must NOT apply the first token to every peer.
		const r = parseDebaterReply('CHANGED: no\nAGREE: A yes, B no\nANSWER:\nx', 'prior', 2);
		expect(r.agree).toEqual([null, null]);
	});

	it('applies a uniform unlabelled stance across all peers', () => {
		const r = parseDebaterReply('CHANGED: no\nAGREE: yes\nANSWER:\nx', 'prior', 2);
		expect(r.agree).toEqual([true, true]);
	});
});

const generateTextMock = vi.mocked(generateText);
const streamTextMock = vi.mocked(streamText);

const assignments: NodeAssignment[] = [
	{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-x' },
	{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', modelId: 'gpt-x' },
	{ node: 'MAGI_3', gateway: 'google', provider: 'google', modelId: 'gemini-x' }
];

const threeResponses: MagiResponse[] = [
	{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', text: 'Answer from MAGI_1' },
	{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', text: 'Answer from MAGI_2' },
	{ node: 'MAGI_3', gateway: 'google', provider: 'google', text: 'Answer from MAGI_3' }
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

// A debater's structured reply: CHANGED flag, optional AGREE value, one-line NOTE,
// full revised ANSWER. `agree` is omitted by default so the legacy parsing tests
// exercise the "no explicit agreement signal" fallback path. It accepts either a
// bare "yes"/"no" (applies to all peers) or a per-peer string ("Peer A: yes, Peer
// B: no").
function debaterReply(
	changed: 'yes' | 'no',
	answer = 'A revised answer',
	note = 'tightened the reasoning',
	usage = { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 },
	agree?: string
) {
	const agreeLine = agree ? `AGREE: ${agree}\n` : '';
	return { text: `CHANGED: ${changed}\n${agreeLine}NOTE: ${note}\nANSWER:\n${answer}`, usage };
}

function verdictOf(events: ConsensusEvent[]): string | undefined {
	const e = events.find((ev) => ev.type === 'complete');
	if (!e || e.type !== 'complete') throw new Error('no complete event emitted');
	return e.debateVerdict;
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

	it('caps the debate at the requested round ceiling', async () => {
		// Debaters never converge; a ceiling of 2 stops the loop after 2 rounds.
		generateTextMock.mockResolvedValue(debaterReply('yes') as never);
		await collect(debateStrategy.execute(context({ debateRounds: 2 })));
		// 3 debaters × 2 rounds = 6 debater calls.
		expect(generateTextMock).toHaveBeenCalledTimes(6);
	});

	it('clamps an out-of-range round ceiling into the selectable range', async () => {
		// A wild value clamps up to MAX_DEBATE_ROUNDS (5): 3 debaters × 5 = 15 calls.
		generateTextMock.mockResolvedValue(debaterReply('yes') as never);
		await collect(debateStrategy.execute(context({ debateRounds: 99 })));
		expect(generateTextMock).toHaveBeenCalledTimes(15);
	});

	it('injects the collaborative directive into debater prompts when enabled', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		await collect(debateStrategy.execute(context({ collaborative: true })));
		const prompt = String(generateTextMock.mock.calls[0]?.[0].prompt);
		expect(prompt).toContain('collaboration aimed at convergence');
	});

	it('omits the collaborative directive by default', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		await collect(debateStrategy.execute(context()));
		const prompt = String(generateTextMock.mock.calls[0]?.[0].prompt);
		expect(prompt).not.toContain('collaboration aimed at convergence');
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
		// The synthesis call is last — it must target MAGI_2's model.
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
		// Debaters run in node order — MAGI_1 (Rationalist), MAGI_2 (Caretaker),
		// MAGI_3 (Individualist). Each prompt carries that debater's lens only.
		const prompts = generateTextMock.mock.calls.map((c) => String(c[0].prompt));
		expect(prompts[0]).toContain('Rationalist aspect');
		expect(prompts[1]).toContain('Caretaker aspect');
		// A debater is never told a peer's disposition — anonymity holds.
		expect(prompts[0]).not.toContain('Caretaker');
	});

	it('surfaces each round to its node panel via node-round events', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no', 'MAGI_3 revised text') as never);
		const events = await collect(debateStrategy.execute(context()));
		const rounds = events.filter((e) => e.type === 'node-round');
		// One round (converged) × three debaters.
		expect(rounds).toHaveLength(3);
		for (const r of rounds) {
			if (r.type !== 'node-round') throw new Error('unreachable');
			expect(r.entry.round).toBe(1);
			expect(r.entry.response).toBe('MAGI_3 revised text');
			// Trimmed inputs surface the node's prior answer + its anonymized peers.
			expect(r.entry.prompt).toContain('Your previous answer');
			expect(r.entry.prompt).toContain('Peer A');
		}
		// The three responding nodes are each represented exactly once.
		const nodes = rounds.map((r) => (r.type === 'node-round' ? r.node : null));
		expect(new Set(nodes)).toEqual(new Set(['MAGI_1', 'MAGI_2', 'MAGI_3']));
	});

	it('builds the round ledger from the CHANGED flag (revised / held)', async () => {
		// MAGI_1 holds, the other two revise → ledger names both groups, no NOTE.
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
		expect(text.fullText).toContain('Answer from MAGI_1');
	});

	it('uses the model’s own SUMMARY: line as the initial position when present', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		const summaries: MagiResponse[] = [
			{
				node: 'MAGI_1',
				gateway: 'anthropic',
				provider: 'anthropic',
				text: 'Long discursive answer with many sentences.\n\nSUMMARY: Privacy must be the default.'
			},
			{
				node: 'MAGI_2',
				gateway: 'openai',
				provider: 'openai',
				text: 'Another long answer.\nSUMMARY: Convenience usually wins.'
			},
			{
				node: 'MAGI_3',
				gateway: 'google',
				provider: 'google',
				text: 'A third answer without the marker.'
			}
		];
		const events = await collect(debateStrategy.execute(context({ responses: summaries })));
		const text = events.find((e) => e.type === 'complete');
		if (!text || text.type !== 'complete') throw new Error('no complete');
		// The two SUMMARY: lines appear verbatim in the ledger; the missing one
		// falls back to the first-sentence gist.
		expect(text.fullText).toContain('Privacy must be the default.');
		expect(text.fullText).toContain('Convenience usually wins.');
		expect(text.fullText).toContain('A third answer without the marker.');
	});

	it('reports consensus when every debater explicitly agrees', async () => {
		// All hold AND say they now agree → the MAGI are in agreement.
		generateTextMock.mockResolvedValue(
			debaterReply('no', 'A revised answer', 'we align', undefined, 'yes') as never
		);
		const events = await collect(debateStrategy.execute(context({ genericLabels: true })));
		expect(verdictOf(events)).toBe('consensus');
		expect(completeText(events)).toContain('in agreement');
	});

	it('does not report consensus when every debater fails a round', async () => {
		// Every debater call rejects, so no round produces any movement OR any
		// agreement signal. A silent (all-failed) debate must never surface as
		// "the MAGI are in agreement" — it falls through to the round-limit → split
		// path instead. Regression guard for the false-consensus bug.
		generateTextMock.mockRejectedValue(new Error('upstream unavailable'));
		const events = await collect(debateStrategy.execute(context()));
		expect(verdictOf(events)).not.toBe('consensus');
		expect(verdictOf(events)).toBe('split');
	});

	it('appends the unified consensus-format contract when the debate converges', async () => {
		generateTextMock.mockResolvedValue(
			debaterReply('no', 'A revised answer', 'we align', undefined, 'yes') as never
		);
		const events = await collect(debateStrategy.execute(context()));
		expect(verdictOf(events)).toBe('consensus');
		const system = String(streamTextMock.mock.calls.at(-1)?.[0].system);
		expect(system).toContain('## Verdict');
		expect(system).toContain('## Reasoning');
		expect(system).toContain('## Confidence');
		// A converged debate is a unified answer, not a side-by-side of positions.
		expect(system).not.toContain('## Positions');
	});

	it('appends the divided consensus-format contract when the debate splits', async () => {
		// 2-vs-1 split (two agree, one dissents) → divided skeleton.
		generateTextMock
			.mockResolvedValueOnce(debaterReply('no', 'ans M', 'agree', undefined, 'yes') as never)
			.mockResolvedValueOnce(debaterReply('no', 'ans B', 'agree', undefined, 'yes') as never)
			.mockResolvedValue(debaterReply('no', 'ans C', 'I differ', undefined, 'no') as never);
		const events = await collect(debateStrategy.execute(context()));
		expect(verdictOf(events)).toBe('split');
		const system = String(streamTextMock.mock.calls.at(-1)?.[0].system);
		expect(system).toContain('## Verdict');
		expect(system).toContain('## Positions');
		expect(system).toContain('## Confidence');
		expect(system).toContain('Do not pick a winner');
		// The divided skeleton replaces Reasoning with Positions.
		expect(system).not.toContain('## Reasoning');
	});

	it('briefs the split synthesizer against self-bias and surfaces the coalition', async () => {
		// Two converge & agree, one holds and dissents — a 2-vs-1 split where the
		// consensus seat (index 0 → MAGI_1) is on the majority side. The synthesis
		// prompt must explicitly forbid privileging its own answer and name the
		// coalition so the model knows which side it's on.
		generateTextMock
			.mockResolvedValueOnce(debaterReply('no', 'ans M', 'agree', undefined, 'yes') as never)
			.mockResolvedValueOnce(debaterReply('no', 'ans B', 'agree', undefined, 'yes') as never)
			.mockResolvedValue(debaterReply('no', 'ans C', 'I differ', undefined, 'no') as never);
		await collect(debateStrategy.execute(context()));
		const synthesisCall = streamTextMock.mock.calls.at(-1)?.[0];
		const system = String(synthesisCall?.system);
		const messages = synthesisCall?.messages as { role: string; content: string }[];
		const userMsg = String(messages?.at(-1)?.content);
		// System prompt explicitly forbids the synthesizer from favoring its own view.
		expect(system).toContain('NO privileged status');
		expect(system).toContain('equal airtime');
		// User prompt names the synthesizer's seat AND surfaces the coalition phrase.
		expect(userMsg).toContain('You are writing as MAGI • 1');
		// Coalition names both majority members, in either order (avoids coupling
		// to coalitionPhrase's iteration order).
		const coalitionIdx = userMsg.indexOf('Coalition:');
		expect(coalitionIdx).toBeGreaterThanOrEqual(0);
		expect(userMsg).toContain('MAGI • 1');
		expect(userMsg).toContain('MAGI • 2');
		expect(userMsg.slice(coalitionIdx)).toMatch(/MAGI . 1/);
		expect(userMsg.slice(coalitionIdx)).toMatch(/MAGI . 2/);
		expect(userMsg).toContain('NO extra weight');
	});

	it('reports a split when a debater explicitly still disagrees', async () => {
		// Two converge and agree, one holds and flags continued disagreement. Even
		// once everyone stops moving, an explicit AGREE: no is a split, not consensus.
		generateTextMock
			.mockResolvedValueOnce(debaterReply('no', 'ans M', 'agree', undefined, 'yes') as never)
			.mockResolvedValueOnce(debaterReply('no', 'ans B', 'agree', undefined, 'yes') as never)
			.mockResolvedValue(debaterReply('no', 'ans C', 'I still differ', undefined, 'no') as never);
		const events = await collect(debateStrategy.execute(context({ genericLabels: true })));
		expect(verdictOf(events)).toBe('split');
		// The synthesizer is briefed to surface the divide, not force a verdict.
		expect(String(streamTextMock.mock.calls.at(-1)?.[0].system)).toContain(
			'manufacture a false consensus'
		);
	});

	it('names the dissenter in a 2-vs-1 split from per-peer AGREE flags', async () => {
		// Peer order per debater (responses minus self): M sees [B, C]; B sees [M, C];
		// C sees [M, B]. MAGI_1 & MAGI_2 align with each other but reject MAGI_3;
		// MAGI_3 rejects both → a clean 2-vs-1 with MAGI_3 as the lone dissenter.
		generateTextMock
			.mockResolvedValueOnce(
				debaterReply('no', 'ans M', 'note', undefined, 'Peer A: yes, Peer B: no') as never
			)
			.mockResolvedValueOnce(
				debaterReply('no', 'ans B', 'note', undefined, 'Peer A: yes, Peer B: no') as never
			)
			.mockResolvedValueOnce(
				debaterReply('no', 'ans C', 'note', undefined, 'Peer A: no, Peer B: no') as never
			);
		const events = await collect(debateStrategy.execute(context()));
		expect(verdictOf(events)).toBe('split');
		const summary = events.find((e) => e.type === 'complete');
		if (!summary || summary.type !== 'complete') throw new Error('no complete');
		expect(summary.debateSummary).toContain('aligned');
		expect(summary.debateSummary).toMatch(/MAGI . 3.*dissents/);
		// The coalition shape is mirrored into the ledger text, not just the banner.
		expect(summary.fullText).toContain('dissents');
	});

	it('describes a three-way divide when no two debaters align', async () => {
		// Every debater rejects both peers → all three pairs disagree, so there is no
		// aligned pair to name. The coalition phrasing falls back to a plain divide.
		generateTextMock.mockResolvedValue(
			debaterReply('no', 'distinct', 'note', undefined, 'Peer A: no, Peer B: no') as never
		);
		const events = await collect(debateStrategy.execute(context()));
		expect(verdictOf(events)).toBe('split');
		const summary = events.find((e) => e.type === 'complete');
		if (!summary || summary.type !== 'complete') throw new Error('no complete');
		expect(summary.debateSummary).toBe('the three MAGI each hold a different position');
		expect(summary.debateSummary).not.toContain('aligned');
	});

	it('reports a split when the debate hits the round limit still diverging', async () => {
		// Everyone keeps changing every round and never signals agreement → split.
		generateTextMock.mockResolvedValue(debaterReply('yes') as never);
		const events = await collect(debateStrategy.execute(context()));
		expect(verdictOf(events)).toBe('split');
		expect(completeText(events)).toContain('round limit');
	});

	it('reports a walkover when only one node responded', async () => {
		const events = await collect(
			debateStrategy.execute(context({ responses: threeResponses.slice(0, 1) }))
		);
		expect(verdictOf(events)).toBe('walkover');
	});

	it('asks each debater for a per-peer agreement stance in its reply format', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		await collect(debateStrategy.execute(context()));
		// The AGREE line names each anonymized peer, not a single collective flag.
		expect(String(generateTextMock.mock.calls[0]?.[0].prompt)).toContain('AGREE: Peer A');
		expect(String(generateTextMock.mock.calls[0]?.[0].prompt)).toContain('Peer B');
	});

	it('seats debate peers in the seeded seat order, stable across rounds', async () => {
		// Pick a seed whose seat order ranks MAGI_3 ahead of MAGI_2, so MAGI_1's
		// debater sees MAGI_3 as Peer A — the reverse of the node-order default.
		let seed = 0;
		for (; seed < 200; seed += 1) {
			const rank = new Map(seededShuffle(threeResponses, seed).map((r, i) => [r.node, i]));
			if ((rank.get('MAGI_3') ?? 0) < (rank.get('MAGI_2') ?? 0)) break;
		}
		// Keep debaters changing so we get multiple rounds; echo a node-stable answer
		// (derived from the incoming "Your current answer") so peers stay identifiable
		// across rounds even after they revise.
		generateTextMock.mockImplementation((opts) => {
			const own =
				String((opts as { prompt: string }).prompt).match(/Your current answer:\n(.+)/)?.[1] ?? '';
			const node = ['MAGI_1', 'MAGI_2', 'MAGI_3'].find((n) => own.includes(n)) ?? 'X';
			return Promise.resolve({
				text: `CHANGED: yes\nNOTE: n\nANSWER:\nrevised-${node}`,
				usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 }
			}) as never;
		});

		const events = await collect(debateStrategy.execute(context({ peerOrderSeed: seed })));
		const magi1Rounds = events
			.filter((e) => e.type === 'node-round' && e.node === 'MAGI_1')
			.map((e) => (e.type === 'node-round' ? e.entry.prompt : ''));
		// More than one round actually ran (debaters never converge here).
		expect(magi1Rounds.length).toBeGreaterThan(1);
		// In every round, MAGI_3 (Peer A for this seed) precedes MAGI_2 (Peer B).
		for (const prompt of magi1Rounds) {
			expect(prompt.indexOf('MAGI_3')).toBeLessThan(prompt.indexOf('MAGI_2'));
		}
	});

	it('emits a debate run-stats record with no voting block', async () => {
		generateTextMock.mockResolvedValue(debaterReply('no') as never);
		const events = await collect(debateStrategy.execute(context({ tier: 'frontier' })));
		const e = events.find((ev) => ev.type === 'run-stats');
		if (!e || e.type !== 'run-stats') throw new Error('no run-stats event emitted');
		expect(e.stats.strategy).toBe('debate');
		expect(e.stats.tier).toBe('frontier');
		expect(e.stats.voting).toBeUndefined();
		expect(e.stats.nodes.MAGI_1).toEqual({
			gateway: 'anthropic',
			provider: 'anthropic',
			model: 'claude-x'
		});
	});
});

describe('extractInitialSummary', () => {
	it('returns the SUMMARY value when it is the final line', () => {
		const text = 'A long winded answer goes here first.\nSUMMARY: Privacy is the default.';
		expect(extractInitialSummary(text)).toBe('Privacy is the default.');
	});

	it('returns the SUMMARY value when there is trailing prose after it', () => {
		// Mid-text SUMMARY: line — the `m` flag should still pick it up.
		const text =
			'Opening paragraph.\nSUMMARY: Convenience usually wins.\nFollow-up rambling about edge cases.';
		expect(extractInitialSummary(text)).toBe('Convenience usually wins.');
	});

	it('uses the LAST SUMMARY line when the model self-corrects', () => {
		const text = 'SUMMARY: First take.\nOn reflection, scratch that.\nSUMMARY: Second take wins.';
		expect(extractInitialSummary(text)).toBe('Second take wins.');
	});

	it('strips bold around the LABEL: **SUMMARY:** foo → foo', () => {
		const text = 'Body of the answer.\n**SUMMARY:** Privacy is the default.';
		const out = extractInitialSummary(text);
		expect(out).toBe('Privacy is the default.');
		expect(out.startsWith('**')).toBe(false);
	});

	it('strips bold around the LABEL form **SUMMARY**: foo → foo', () => {
		const text = 'Body of the answer.\n**SUMMARY**: Convenience usually wins.';
		const out = extractInitialSummary(text);
		expect(out).toBe('Convenience usually wins.');
		expect(out.startsWith('**')).toBe(false);
	});

	it('accepts a leading bullet marker before the label', () => {
		const text = 'Body of the answer.\n- SUMMARY: Privacy is the default.';
		expect(extractInitialSummary(text)).toBe('Privacy is the default.');
	});

	it('accepts en-dash and em-dash separators after the label', () => {
		const enDash = 'Body.\nSUMMARY – Privacy is the default.';
		const emDash = 'Body.\nSUMMARY — Convenience usually wins.';
		expect(extractInitialSummary(enDash)).toBe('Privacy is the default.');
		expect(extractInitialSummary(emDash)).toBe('Convenience usually wins.');
	});

	it('rejects angle-bracket placeholder echoes and falls back to gist', () => {
		// A model that parroted the prompt template instead of writing a real summary.
		const text =
			'This is the actual first sentence. Then more details follow.\nSUMMARY: <one short sentence stating your position>';
		const out = extractInitialSummary(text);
		expect(out).not.toContain('<');
		expect(out).toBe('This is the actual first sentence.');
	});

	it('falls back to gist when the SUMMARY value is empty', () => {
		const text = 'This is the actual first sentence. Then more details follow.\nSUMMARY: ';
		const out = extractInitialSummary(text);
		expect(out).toBe('This is the actual first sentence.');
	});

	it('falls back to a first-sentence gist when no SUMMARY line exists', () => {
		const text = 'A third answer without the marker. Followed by some more prose.';
		expect(extractInitialSummary(text)).toBe('A third answer without the marker.');
	});

	it('caps a very long SUMMARY at 160 chars plus an ellipsis', () => {
		const long = 'x'.repeat(300);
		const text = `Body.\nSUMMARY: ${long}`;
		const out = extractInitialSummary(text);
		expect(out.length).toBe(158); // 157 chars + the ellipsis
		expect(out.endsWith('…')).toBe(true);
	});
});

describe('stripSummaryTail', () => {
	it('strips the trailing SUMMARY line when there is other content above', () => {
		const text = 'Free will is an illusion.\nSUMMARY: Free will is an illusion.';
		expect(stripSummaryTail(text)).toBe('Free will is an illusion.');
	});

	it('strips through trailing blank lines between the body and the SUMMARY line', () => {
		const text = 'Long answer.\n\n\nSUMMARY: A succinct take.';
		expect(stripSummaryTail(text)).toBe('Long answer.');
	});

	it('tolerates bold around the SUMMARY label in the tail', () => {
		expect(stripSummaryTail('Body.\n**SUMMARY:** foo')).toBe('Body.');
		expect(stripSummaryTail('Body.\n**SUMMARY**: foo')).toBe('Body.');
	});

	it('tolerates a leading bullet on the SUMMARY tail', () => {
		expect(stripSummaryTail('Body.\n- SUMMARY: foo')).toBe('Body.');
	});

	it('does not strip when the SUMMARY line is the only content', () => {
		// Keep something on screen — better the metadata than a blank panel.
		const text = 'SUMMARY: only line';
		expect(stripSummaryTail(text)).toBe(text);
	});

	it('does not strip a SUMMARY line that is followed by more prose', () => {
		const text = 'Intro.\nSUMMARY: not at end\n\nMore body after.';
		expect(stripSummaryTail(text)).toBe(text);
	});

	it('returns text unchanged when there is no SUMMARY line', () => {
		const text = 'Just a plain answer with no metadata tail.';
		expect(stripSummaryTail(text)).toBe(text);
	});

	it('strips a bare mid-stream SUMMARY prefix (no separator yet)', () => {
		// While the stream is mid-flight the tail is briefly `\nSUMMARY` before the
		// colon arrives; treat it as a SUMMARY line to avoid a one-frame flicker.
		expect(stripSummaryTail('Body.\nSUMMARY')).toBe('Body.');
	});

	it('strips a SUMMARY line with an empty value (separator but no value yet)', () => {
		// Same flicker window, one keystroke later: `\nSUMMARY:` with no value.
		expect(stripSummaryTail('Body.\nSUMMARY:')).toBe('Body.');
	});

	it('strips every trailing SUMMARY line when the model self-corrects', () => {
		// Earlier SUMMARY lines are noise the same way they are for extractInitialSummary;
		// don't leak the rejected take into the displayed panel.
		const text = 'Body.\nSUMMARY: first\nSUMMARY: second';
		expect(stripSummaryTail(text)).toBe('Body.');
	});
});
