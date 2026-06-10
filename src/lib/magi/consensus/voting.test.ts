import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import { votingStrategy } from './voting';
import type { ConsensusContext, ConsensusEvent } from './types';
import type { NodeAssignment } from '../config';
import type { MagiResponse } from '../types';

vi.mock('ai', () => ({ generateText: vi.fn() }));

const generateTextMock = vi.mocked(generateText);

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
		query: 'Which answer is best?',
		getModel: vi.fn(() => ({}) as never),
		nodeAssignments: assignments,
		consensusNodeIndex: 0,
		...overrides
	};
}

// A juror's plain-text reply: one "<label>: <score>" line per candidate.
function jurorReply(
	scores: { candidate: string; score: number }[],
	usage = { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 }
) {
	return {
		text: scores.map((s) => `${s.candidate}: ${s.score} — solid reasoning`).join('\n'),
		usage
	};
}

async function collect(iter: AsyncIterable<ConsensusEvent>): Promise<ConsensusEvent[]> {
	const out: ConsensusEvent[] = [];
	for await (const event of iter) out.push(event);
	return out;
}

function completeText(events: ConsensusEvent[]): string {
	const complete = events.find((e) => e.type === 'complete');
	if (!complete || complete.type !== 'complete') throw new Error('no complete event emitted');
	return complete.fullText;
}

beforeEach(() => {
	generateTextMock.mockReset();
});

describe('votingStrategy.execute', () => {
	it('emits text-delta, complete, usage, then run-stats', async () => {
		generateTextMock.mockResolvedValue(
			jurorReply([
				{ candidate: 'A', score: 5 },
				{ candidate: 'B', score: 5 }
			]) as never
		);
		const events = await collect(votingStrategy.execute(context()));
		expect(events.map((e) => e.type)).toEqual(['text-delta', 'complete', 'usage', 'run-stats']);
	});

	it('runs a juror per response and crowns the highest aggregate score', async () => {
		// Jurors run in node order: MELCHIOR, BALTHASAR, CASPAR.
		generateTextMock
			// MELCHIOR juror — A=BALTHASAR, B=CASPAR
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 9 },
					{ candidate: 'B', score: 5 }
				]) as never
			)
			// BALTHASAR juror — A=MELCHIOR, B=CASPAR
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 4 },
					{ candidate: 'B', score: 6 }
				]) as never
			)
			// CASPAR juror — A=MELCHIOR, B=BALTHASAR
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 3 },
					{ candidate: 'B', score: 8 }
				]) as never
			);
		const text = completeText(await collect(votingStrategy.execute(context())));
		// BALTHASAR: 9 + 8 = 17 (winner). CASPAR: 5 + 6 = 11. MELCHIOR: 4 + 3 = 7.
		expect(generateTextMock).toHaveBeenCalledTimes(3);
		expect(text).toContain('BALTHASAR');
		expect(text).toContain('wins (17 / 20)');
		expect(text).toContain('Answer from BALTHASAR');
		// Juror scores are bracketed so the score reads clearly after the label.
		expect(text).toContain('MELCHIOR • 1 (9)');
	});

	it('parses scores from replies with bullets and bold markers', async () => {
		generateTextMock.mockResolvedValue({
			text: '- **A**: 9/10 — strong\n- **B)** 5 — weaker',
			usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 }
		} as never);
		const text = completeText(await collect(votingStrategy.execute(context())));
		// Every juror scores A=9, B=5, so the response sitting at each juror's
		// "A" slot collects the 9s — a clean winner emerges, not the fallback.
		expect(text).toContain('wins');
		expect(text).not.toContain('No scores were returned');
	});

	it('sums token usage across every juror call', async () => {
		generateTextMock.mockResolvedValue(
			jurorReply(
				[
					{ candidate: 'A', score: 5 },
					{ candidate: 'B', score: 5 }
				],
				{ inputTokens: 10, outputTokens: 5, cachedInputTokens: 1 }
			) as never
		);
		const events = await collect(votingStrategy.execute(context()));
		expect(events.find((e) => e.type === 'usage')).toEqual({
			type: 'usage',
			inputTokens: 30,
			outputTokens: 15,
			cachedInputTokens: 3
		});
	});

	it('holds a vote among just two jurors when one node errored', async () => {
		generateTextMock
			.mockResolvedValueOnce(jurorReply([{ candidate: 'A', score: 8 }]) as never)
			.mockResolvedValueOnce(jurorReply([{ candidate: 'A', score: 6 }]) as never);
		const text = completeText(
			await collect(votingStrategy.execute(context({ responses: threeResponses.slice(0, 2) })))
		);
		expect(generateTextMock).toHaveBeenCalledTimes(2);
		// MELCHIOR scores BALTHASAR 8; BALTHASAR scores MELCHIOR 6 → BALTHASAR wins.
		expect(text).toContain('BALTHASAR');
		expect(text).toContain('wins (8 / 10)');
	});

	it('declares a sole responder the winner without holding a vote', async () => {
		const events = await collect(
			votingStrategy.execute(context({ responses: threeResponses.slice(0, 1) }))
		);
		expect(generateTextMock).not.toHaveBeenCalled();
		expect(completeText(events)).toContain('Answer from MELCHIOR');
	});

	it('drops a juror whose call fails and tallies the remaining scores', async () => {
		generateTextMock
			.mockRejectedValueOnce(new Error('model unavailable'))
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 2 },
					{ candidate: 'B', score: 7 }
				]) as never
			)
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 2 },
					{ candidate: 'B', score: 9 }
				]) as never
			);
		// MELCHIOR juror failed. BALTHASAR: A=MELCHIOR 2, B=CASPAR 7. CASPAR: A=MELCHIOR 2, B=BALTHASAR 9.
		// Totals — BALTHASAR 9, CASPAR 7, MELCHIOR 4 → BALTHASAR wins on one juror score.
		const text = completeText(await collect(votingStrategy.execute(context())));
		expect(text).toContain('BALTHASAR');
		expect(text).toContain('wins (9 / 10)');
	});

	it('ignores a juror whose reply has no readable scores', async () => {
		generateTextMock
			.mockResolvedValueOnce({
				text: 'Both answers are quite good, hard to choose.',
				usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 }
			} as never)
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 2 },
					{ candidate: 'B', score: 7 }
				]) as never
			)
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 2 },
					{ candidate: 'B', score: 9 }
				]) as never
			);
		// MELCHIOR's reply is unreadable; the other two still produce a winner.
		const text = completeText(await collect(votingStrategy.execute(context())));
		expect(text).toContain('wins');
		expect(text).not.toContain('No scores were returned');
	});

	it('falls back to the first response when every juror call fails', async () => {
		generateTextMock.mockRejectedValue(new Error('all jurors down'));
		const text = completeText(await collect(votingStrategy.execute(context())));
		expect(text).toContain('No scores were returned');
		expect(text).toContain('all jurors down');
		expect(text).toContain('Answer from MELCHIOR');
	});

	it('forwards the abort signal to every juror call', async () => {
		generateTextMock.mockResolvedValue(
			jurorReply([
				{ candidate: 'A', score: 5 },
				{ candidate: 'B', score: 5 }
			]) as never
		);
		const signal = new AbortController().signal;
		await collect(votingStrategy.execute(context({ signal })));
		for (const call of generateTextMock.mock.calls) {
			expect(call[0].abortSignal).toBe(signal);
		}
	});

	it('ignores consensusTemperament — voting jurors never get a temperament lens', async () => {
		generateTextMock.mockResolvedValue(
			jurorReply([
				{ candidate: 'A', score: 5 },
				{ candidate: 'B', score: 5 }
			]) as never
		);
		// Even with the toggle on, jurors score neutrally: the tally stays objective,
		// so no dispositional lens is injected into any juror prompt.
		await collect(votingStrategy.execute(context({ consensusTemperament: true })));
		for (const call of generateTextMock.mock.calls) {
			expect(String(call[0].prompt)).not.toContain('aspect of the MAGI system');
		}
	});

	it('omits temperament lenses from juror prompts by default', async () => {
		generateTextMock.mockResolvedValue(
			jurorReply([
				{ candidate: 'A', score: 5 },
				{ candidate: 'B', score: 5 }
			]) as never
		);
		await collect(votingStrategy.execute(context()));
		for (const call of generateTextMock.mock.calls) {
			expect(String(call[0].prompt)).not.toContain('aspect of the MAGI system');
		}
	});

	it('names the winner with generic node labels when genericLabels is set', async () => {
		generateTextMock.mockResolvedValue(
			jurorReply([
				{ candidate: 'A', score: 5 },
				{ candidate: 'B', score: 5 }
			]) as never
		);
		const text = completeText(
			await collect(votingStrategy.execute(context({ genericLabels: true })))
		);
		// Check the verdict heading — the winning response body is verbatim and
		// may itself mention a node name.
		const heading = text.split('\n')[0];
		expect(heading).toContain('MAGI');
		expect(heading).not.toContain('MELCHIOR');
	});
});

// Pull the RunStats payload off the run-stats event, asserting it carries the
// voting block (every multi-response vote does).
function runStats(events: ConsensusEvent[]) {
	const e = events.find((ev) => ev.type === 'run-stats');
	if (!e || e.type !== 'run-stats') throw new Error('no run-stats event emitted');
	return e.stats;
}
function voting(events: ConsensusEvent[]) {
	const v = runStats(events).voting;
	if (!v) throw new Error('run-stats carried no voting block');
	return v;
}

describe('votingStrategy stats event', () => {
	it('emits a run-stats event with winner, totals, tiebreak path, and per-juror breakdown', async () => {
		generateTextMock
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 9 },
					{ candidate: 'B', score: 5 }
				]) as never
			)
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 4 },
					{ candidate: 'B', score: 6 }
				]) as never
			)
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 3 },
					{ candidate: 'B', score: 8 }
				]) as never
			);
		const events = await collect(votingStrategy.execute(context({ tier: 'balanced' })));
		const stats = runStats(events);
		const v = voting(events);

		expect(stats.strategy).toBe('voting');
		// BALTHASAR total = 9 (from MELCHIOR's A) + 8 (from CASPAR's B) = 17 → winner.
		expect(v.winner).toBe('BALTHASAR');
		expect(v.winnerTotal).toBe(17);
		expect(v.winnerModel).toBe('gpt-x');
		expect(v.tiebreak).toBe('none');
		expect(v.totals).toEqual({ MELCHIOR: 7, BALTHASAR: 17, CASPAR: 11 });
		expect(v.models).toEqual({
			MELCHIOR: 'claude-x',
			BALTHASAR: 'gpt-x',
			CASPAR: 'gemini-x'
		});
		expect(stats.tier).toBe('balanced');
		// Node identities ride along on the run record for the usage breakdowns.
		expect(stats.nodes.BALTHASAR).toEqual({
			gateway: 'openai',
			provider: 'openai',
			model: 'gpt-x'
		});
		// Three jurors × two candidates each = 6 score samples in the position-bias pool.
		expect(v.positionBias.n).toBe(6);
		expect(v.positionBias.avgA).toBeCloseTo((9 + 4 + 3) / 3, 5);
		expect(v.positionBias.avgB).toBeCloseTo((5 + 6 + 8) / 3, 5);
		// Per-juror grid preserves which anonymized slot each peer sat in.
		expect(v.jurors).toHaveLength(3);
		const melchiorRow = v.jurors.find((j) => j.juror === 'MELCHIOR');
		expect(melchiorRow?.candidateA).toEqual({ node: 'BALTHASAR', score: 9 });
		expect(melchiorRow?.candidateB).toEqual({ node: 'CASPAR', score: 5 });
	});

	it('flags a node-order tiebreak when totals and best scores tie', async () => {
		// Every juror gives 5/5 — every response totals 10, best is 5 → MELCHIOR
		// wins by stable-sort node order, not by merit.
		generateTextMock.mockResolvedValue(
			jurorReply([
				{ candidate: 'A', score: 5 },
				{ candidate: 'B', score: 5 }
			]) as never
		);
		const v = voting(await collect(votingStrategy.execute(context())));
		expect(v.tiebreak).toBe('node-order');
		expect(v.winner).toBe('MELCHIOR');
	});

	it('flags a best-score tiebreak when totals tie but one has a higher peak', async () => {
		// MELCHIOR juror gives BALTHASAR=10, CASPAR=0 (totals MELCHIOR≠ aside).
		// BALTHASAR juror gives MELCHIOR=5, CASPAR=5.
		// CASPAR juror gives MELCHIOR=5, BALTHASAR=0.
		// Totals: MELCHIOR=10, BALTHASAR=10, CASPAR=5. MELCHIOR & BALTHASAR tied,
		// but BALTHASAR has a 10 (vs MELCHIOR's best 5) → BALTHASAR wins by best score.
		generateTextMock
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 10 },
					{ candidate: 'B', score: 0 }
				]) as never
			)
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 5 },
					{ candidate: 'B', score: 5 }
				]) as never
			)
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 5 },
					{ candidate: 'B', score: 0 }
				]) as never
			);
		const v = voting(await collect(votingStrategy.execute(context())));
		expect(v.winner).toBe('BALTHASAR');
		expect(v.tiebreak).toBe('best-score');
	});

	it('emits a walkover stats event when only one node responded', async () => {
		const v = voting(
			await collect(votingStrategy.execute(context({ responses: threeResponses.slice(0, 1) })))
		);
		expect(v.tiebreak).toBe('walkover');
		expect(v.winner).toBe('MELCHIOR');
		expect(v.positionBias.n).toBe(0);
		expect(v.jurors).toEqual([]);
	});

	it('records null scores in the juror grid when a reply parses nothing', async () => {
		generateTextMock
			.mockResolvedValueOnce({
				text: 'no readable scores here',
				usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 }
			} as never)
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 6 },
					{ candidate: 'B', score: 4 }
				]) as never
			)
			.mockResolvedValueOnce(
				jurorReply([
					{ candidate: 'A', score: 7 },
					{ candidate: 'B', score: 3 }
				]) as never
			);
		const v = voting(await collect(votingStrategy.execute(context())));
		const melchiorRow = v.jurors.find((j) => j.juror === 'MELCHIOR');
		expect(melchiorRow?.candidateA.score).toBeNull();
		expect(melchiorRow?.candidateB?.score).toBeNull();
		// MELCHIOR's unreadable reply doesn't pollute the position-bias pool —
		// only the other two jurors' four readable scores count.
		expect(v.positionBias.n).toBe(4);
	});
});
