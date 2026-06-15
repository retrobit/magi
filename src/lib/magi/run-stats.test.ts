import { describe, it, expect, beforeEach } from 'vitest';
import {
	loadRunStats,
	appendRunStat,
	clearRunStats,
	exportRunStats,
	aggregate,
	type RunStatRecord
} from './run-stats';
import type { RunStats, VotingStats, DebateStats } from './consensus/types';

const STORAGE_KEY = 'magi:run-stats:v1';

class MemoryStorage implements Storage {
	private store = new Map<string, string>();
	get length() {
		return this.store.size;
	}
	clear() {
		this.store.clear();
	}
	getItem(k: string) {
		return this.store.get(k) ?? null;
	}
	key(i: number) {
		return [...this.store.keys()][i] ?? null;
	}
	removeItem(k: string) {
		this.store.delete(k);
	}
	setItem(k: string, v: string) {
		this.store.set(k, v);
	}
}

function makeVoting(overrides: Partial<VotingStats> = {}): VotingStats {
	return {
		winner: 'MAGI_1',
		winnerModel: 'claude-x',
		winnerTotal: 15,
		tiebreak: 'none',
		totals: { MAGI_1: 15, MAGI_2: 10, MAGI_3: 5 },
		lengths: { MAGI_1: 1000, MAGI_2: 800, MAGI_3: 1200 },
		models: { MAGI_1: 'claude-x', MAGI_2: 'gpt-x', MAGI_3: 'gemini-x' },
		jurors: [],
		positionBias: { avgA: 7, avgB: 5, n: 4 },
		...overrides
	};
}

function makeDebate(overrides: Partial<DebateStats> = {}): DebateStats {
	return {
		verdict: 'consensus',
		hitLimit: false,
		rounds: 2,
		revisions: { MAGI_1: 1, MAGI_2: 1, MAGI_3: 0 },
		models: { MAGI_1: 'claude-x', MAGI_2: 'gpt-x', MAGI_3: 'deepseek-x' },
		dissenter: null,
		...overrides
	};
}

const NODES: RunStats['nodes'] = {
	MAGI_1: { gateway: 'anthropic', provider: 'anthropic', model: 'claude-x' },
	MAGI_2: { gateway: 'openai', provider: 'openai', model: 'gpt-x' },
	MAGI_3: { gateway: 'openrouter', provider: 'deepseek', model: 'deepseek-x' }
};

function makeRun(overrides: Partial<RunStats> = {}): RunStats {
	return {
		strategy: 'voting',
		tier: 'balanced',
		synthesizerAwareness: false,
		consensusTemperament: false,
		nodes: NODES,
		voting: makeVoting(),
		...overrides
	};
}

beforeEach(() => {
	const mem = new MemoryStorage();
	// jsdom isn't the test env for this file (server project), so stub the global.
	(globalThis as { window?: { localStorage: Storage } }).window = { localStorage: mem };
	mem.clear();
});

describe('run-stats persistence', () => {
	it('returns an empty list when nothing has been stored', () => {
		expect(loadRunStats()).toEqual([]);
	});

	it('appends a record and reads it back', () => {
		appendRunStat(makeRun());
		const records = loadRunStats();
		expect(records).toHaveLength(1);
		expect(records[0].stats.voting?.winner).toBe('MAGI_1');
		expect(typeof records[0].ts).toBe('number');
	});

	it('caps the history at the 500 most recent records', () => {
		for (let i = 0; i < 510; i += 1) {
			appendRunStat(makeRun({ voting: makeVoting({ winnerTotal: i }) }));
		}
		const records = loadRunStats();
		expect(records).toHaveLength(500);
		// Oldest 10 were dropped — the first remaining record's total is 10.
		expect(records[0].stats.voting?.winnerTotal).toBe(10);
		expect(records.at(-1)?.stats.voting?.winnerTotal).toBe(509);
	});

	it('clears the history', () => {
		appendRunStat(makeRun());
		clearRunStats();
		expect(loadRunStats()).toEqual([]);
	});

	it('drops a malformed payload silently rather than throwing', () => {
		(globalThis as { window?: { localStorage: Storage } }).window!.localStorage.setItem(
			STORAGE_KEY,
			'{not valid json'
		);
		expect(loadRunStats()).toEqual([]);
	});

	it('drops a version-mismatched payload silently', () => {
		(globalThis as { window?: { localStorage: Storage } }).window!.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ version: 99, records: [] })
		);
		expect(loadRunStats()).toEqual([]);
	});

	it('exports the stored envelope as pretty-printed JSON', () => {
		appendRunStat(makeRun({ voting: makeVoting({ winnerTotal: 17 }) }));
		appendRunStat(makeRun());
		const json = exportRunStats();
		// Pretty-printed (2-space indent) so it reads as inspectable JSON.
		expect(json).toContain('\n  "version": 1');
		expect(json).toContain('\n  "records": [');
		const parsed = JSON.parse(json);
		expect(parsed.version).toBe(1);
		expect(parsed.records).toHaveLength(2);
		expect(parsed.records[0].stats.voting.winnerTotal).toBe(17);
		expect(typeof parsed.records[0].ts).toBe('number');
	});

	it('exports a valid empty envelope when nothing has been stored', () => {
		const parsed = JSON.parse(exportRunStats());
		expect(parsed).toEqual({ version: 1, records: [] });
	});
});

describe('run-stats aggregate', () => {
	function record(stats: Partial<RunStats>, ts = 0): RunStatRecord {
		return { ts, stats: makeRun(stats) };
	}

	it('returns zeros for an empty input', () => {
		const agg = aggregate([]);
		expect(agg.total).toBe(0);
		expect(agg.byStrategy).toEqual({ none: 0, synthesis: 0, voting: 0, debate: 0 });
		expect(agg.usageByGateway).toEqual([]);
		expect(agg.usageByNode).toEqual({ MAGI_1: 0, MAGI_2: 0, MAGI_3: 0 });
		expect(agg.voting.total).toBe(0);
		expect(agg.voting.winsByModel).toEqual([]);
		expect(agg.voting.avgPositionBias).toEqual({ avgA: 0, avgB: 0, samples: 0 });
		expect(agg.debate.total).toBe(0);
		expect(agg.debate.verdictCounts).toEqual({ consensus: 0, split: 0, walkover: 0 });
		expect(agg.debate.avgRoundsToConverge).toBe(0);
	});

	it('counts runs by strategy across all three kinds', () => {
		const agg = aggregate([
			record({ strategy: 'synthesis', voting: undefined }),
			record({ strategy: 'synthesis', voting: undefined }),
			record({ strategy: 'voting' }),
			record({ strategy: 'debate', voting: undefined, debate: makeDebate() })
		]);
		expect(agg.total).toBe(4);
		expect(agg.byStrategy).toEqual({ none: 0, synthesis: 2, voting: 1, debate: 1 });
		// Only the voting run contributes to the voting deep-dive.
		expect(agg.voting.total).toBe(1);
		// Only the debate run contributes to the debate deep-dive.
		expect(agg.debate.total).toBe(1);
	});

	it('tallies usage axes from every responding node, both strategies', () => {
		const agg = aggregate([record({ strategy: 'synthesis', voting: undefined }), record({})]);
		// Two runs × three nodes each → each node participated twice.
		expect(agg.usageByNode).toEqual({ MAGI_1: 2, MAGI_2: 2, MAGI_3: 2 });
		const gw = Object.fromEntries(agg.usageByGateway.map((e) => [e.key, e.count]));
		expect(gw).toEqual({ anthropic: 2, openai: 2, openrouter: 2 });
		const prov = Object.fromEntries(agg.usageByProvider.map((e) => [e.key, e.count]));
		expect(prov.deepseek).toBe(2);
		// Provider labels resolve through the registry.
		expect(agg.usageByProvider.find((e) => e.key === 'deepseek')?.label).toBe('DeepSeek');
	});

	it('counts voting wins by node and by model separately', () => {
		const agg = aggregate([
			record({ voting: makeVoting({ winner: 'MAGI_1', winnerModel: 'claude-x' }) }),
			record({ voting: makeVoting({ winner: 'MAGI_1', winnerModel: 'claude-x' }) }),
			record({ voting: makeVoting({ winner: 'MAGI_1', winnerModel: 'claude-y' }) }),
			record({ voting: makeVoting({ winner: 'MAGI_2', winnerModel: 'gpt-x' }) })
		]);
		expect(agg.voting.total).toBe(4);
		expect(agg.voting.winsByNode).toEqual({ MAGI_1: 3, MAGI_2: 1, MAGI_3: 0 });
		expect(agg.voting.winsByModel.map((w) => `${w.node}:${w.model}:${w.wins}`)).toEqual([
			'MAGI_1:claude-x:2',
			'MAGI_1:claude-y:1',
			'MAGI_2:gpt-x:1'
		]);
	});

	it('derives voting wins by gateway/provider from the winner node identity', () => {
		const agg = aggregate([
			record({ voting: makeVoting({ winner: 'MAGI_1' }) }), // anthropic
			record({ voting: makeVoting({ winner: 'MAGI_3' }) }) // openrouter / deepseek
		]);
		const wg = Object.fromEntries(agg.voting.winsByGateway.map((e) => [e.key, e.count]));
		expect(wg).toEqual({ anthropic: 1, openrouter: 1 });
		const wp = Object.fromEntries(agg.voting.winsByProvider.map((e) => [e.key, e.count]));
		expect(wp).toEqual({ anthropic: 1, deepseek: 1 });
	});

	it('weights position-bias averages by the number of samples per vote', () => {
		const agg = aggregate([
			record({ voting: makeVoting({ positionBias: { avgA: 8, avgB: 4, n: 4 } }) }),
			record({ voting: makeVoting({ positionBias: { avgA: 2, avgB: 9, n: 1 } }) })
		]);
		// avgA = (8*4 + 2*1) / 5 = 6.8
		expect(agg.voting.avgPositionBias.avgA).toBeCloseTo(6.8, 5);
		// avgB = (4*4 + 9*1) / 5 = 5.0
		expect(agg.voting.avgPositionBias.avgB).toBeCloseTo(5.0, 5);
		expect(agg.voting.avgPositionBias.samples).toBe(5);
	});

	it('tallies tiebreak paths', () => {
		const agg = aggregate([
			record({ voting: makeVoting({ tiebreak: 'none' }) }),
			record({ voting: makeVoting({ tiebreak: 'none' }) }),
			record({ voting: makeVoting({ tiebreak: 'best-score' }) }),
			record({ voting: makeVoting({ tiebreak: 'node-order' }) }),
			record({ voting: makeVoting({ tiebreak: 'walkover' }) })
		]);
		expect(agg.voting.tiebreakDistribution).toEqual({
			none: 2,
			'best-score': 1,
			'node-order': 1,
			walkover: 1
		});
	});

	it('ignores synthesis runs when computing voting length averages', () => {
		const agg = aggregate([
			record({ strategy: 'synthesis', voting: undefined }),
			record({
				voting: makeVoting({
					winner: 'MAGI_1',
					lengths: { MAGI_1: 1000, MAGI_2: 500, MAGI_3: 700 }
				})
			}),
			record({
				voting: makeVoting({
					winner: 'MAGI_2',
					lengths: { MAGI_1: 200, MAGI_2: 800, MAGI_3: 400 }
				})
			})
		]);
		// Winners: 1000, 800 → avg 900. Losers: 500, 700, 200, 400 → avg 450.
		expect(agg.voting.winnerAvgLength).toBe(900);
		expect(agg.voting.loserAvgLength).toBe(450);
	});

	// ----- Debate deep-dive -----

	function debateRun(d: Partial<DebateStats>): RunStatRecord {
		return record({ strategy: 'debate', voting: undefined, debate: makeDebate(d) });
	}

	it('counts debate verdicts and hit-limit runs', () => {
		const agg = aggregate([
			debateRun({ verdict: 'consensus' }),
			debateRun({ verdict: 'consensus' }),
			debateRun({ verdict: 'split', hitLimit: true }),
			debateRun({ verdict: 'walkover', rounds: 0, revisions: {}, models: { MAGI_1: 'claude-x' } })
		]);
		expect(agg.debate.total).toBe(4);
		expect(agg.debate.verdictCounts).toEqual({ consensus: 2, split: 1, walkover: 1 });
		expect(agg.debate.hitLimitCount).toBe(1);
	});

	it('averages rounds-to-converge across consensus runs only', () => {
		const agg = aggregate([
			debateRun({ verdict: 'consensus', rounds: 1 }),
			debateRun({ verdict: 'consensus', rounds: 3 }),
			// Splits and walkovers are excluded — only successful convergence counts.
			debateRun({ verdict: 'split', rounds: 3, hitLimit: true }),
			debateRun({ verdict: 'walkover', rounds: 0, revisions: {}, models: {} })
		]);
		expect(agg.debate.avgRoundsToConverge).toBe(2);
	});

	it('returns 0 avg rounds when no debate converged', () => {
		const agg = aggregate([
			debateRun({ verdict: 'split', rounds: 3, hitLimit: true }),
			debateRun({ verdict: 'walkover', rounds: 0, revisions: {}, models: {} })
		]);
		expect(agg.debate.avgRoundsToConverge).toBe(0);
	});

	it('sums per-node revisions and rounds across all debate runs', () => {
		const agg = aggregate([
			debateRun({
				rounds: 2,
				revisions: { MAGI_1: 2, MAGI_2: 0, MAGI_3: 1 },
				models: { MAGI_1: 'claude-x', MAGI_2: 'gpt-x', MAGI_3: 'deepseek-x' }
			}),
			debateRun({
				rounds: 3,
				revisions: { MAGI_1: 1, MAGI_2: 3, MAGI_3: 2 },
				models: { MAGI_1: 'claude-x', MAGI_2: 'gpt-x', MAGI_3: 'deepseek-x' }
			})
		]);
		// MAGI_1 revised 3 out of 5 rounds (2 + 3). MAGI_2 3/5. MAGI_3 3/5.
		expect(agg.debate.revisionRateByNode.MAGI_1).toEqual({ revised: 3, rounds: 5, rate: 0.6 });
		expect(agg.debate.revisionRateByNode.MAGI_2).toEqual({ revised: 3, rounds: 5, rate: 0.6 });
		expect(agg.debate.revisionRateByNode.MAGI_3).toEqual({ revised: 3, rounds: 5, rate: 0.6 });
	});

	it('only credits rounds to nodes that actually participated', () => {
		const agg = aggregate([
			debateRun({
				rounds: 2,
				// MAGI_3 didn't respond this run — `models` omits it.
				revisions: { MAGI_1: 1, MAGI_2: 2 },
				models: { MAGI_1: 'claude-x', MAGI_2: 'gpt-x' }
			})
		]);
		expect(agg.debate.revisionRateByNode.MAGI_1).toEqual({ revised: 1, rounds: 2, rate: 0.5 });
		expect(agg.debate.revisionRateByNode.MAGI_2).toEqual({ revised: 2, rounds: 2, rate: 1 });
		// MAGI_3's denominator stays 0 → rate 0, not NaN.
		expect(agg.debate.revisionRateByNode.MAGI_3).toEqual({ revised: 0, rounds: 0, rate: 0 });
	});

	it('tallies dissenter by node, ignoring three-way splits and consensus runs', () => {
		const agg = aggregate([
			debateRun({ verdict: 'split', dissenter: 'MAGI_1' }),
			debateRun({ verdict: 'split', dissenter: 'MAGI_1' }),
			debateRun({ verdict: 'split', dissenter: 'MAGI_3' }),
			// Three-way split has no clean dissenter → not credited.
			debateRun({ verdict: 'split', dissenter: null }),
			// Consensus runs never set a dissenter, but verify they don't leak in.
			debateRun({ verdict: 'consensus' })
		]);
		expect(agg.debate.dissenterByNode).toEqual({ MAGI_1: 2, MAGI_2: 0, MAGI_3: 1 });
	});

	it('ignores synthesis and voting runs when aggregating debate metrics', () => {
		const agg = aggregate([
			record({ strategy: 'synthesis', voting: undefined }),
			record({ strategy: 'voting' }),
			debateRun({ verdict: 'consensus', rounds: 2 })
		]);
		expect(agg.debate.total).toBe(1);
		expect(agg.debate.verdictCounts).toEqual({ consensus: 1, split: 0, walkover: 0 });
	});
});
