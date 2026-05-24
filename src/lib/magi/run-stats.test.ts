import { describe, it, expect, beforeEach } from 'vitest';
import {
	loadRunStats,
	appendRunStat,
	clearRunStats,
	aggregate,
	type RunStatRecord
} from './run-stats';
import type { RunStats, VotingStats } from './consensus/types';

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
		winner: 'MELCHIOR',
		winnerModel: 'claude-x',
		winnerTotal: 15,
		tiebreak: 'none',
		totals: { MELCHIOR: 15, BALTHASAR: 10, CASPAR: 5 },
		lengths: { MELCHIOR: 1000, BALTHASAR: 800, CASPAR: 1200 },
		models: { MELCHIOR: 'claude-x', BALTHASAR: 'gpt-x', CASPAR: 'gemini-x' },
		jurors: [],
		positionBias: { avgA: 7, avgB: 5, n: 4 },
		...overrides
	};
}

const NODES: RunStats['nodes'] = {
	MELCHIOR: { gateway: 'anthropic', provider: 'anthropic', model: 'claude-x' },
	BALTHASAR: { gateway: 'openai', provider: 'openai', model: 'gpt-x' },
	CASPAR: { gateway: 'openrouter', provider: 'deepseek', model: 'deepseek-x' }
};

function makeRun(overrides: Partial<RunStats> = {}): RunStats {
	return {
		strategy: 'voting',
		tier: 'balanced',
		temperaments: false,
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
		expect(records[0].stats.voting?.winner).toBe('MELCHIOR');
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
});

describe('run-stats aggregate', () => {
	function record(stats: Partial<RunStats>, ts = 0): RunStatRecord {
		return { ts, stats: makeRun(stats) };
	}

	it('returns zeros for an empty input', () => {
		const agg = aggregate([]);
		expect(agg.total).toBe(0);
		expect(agg.byStrategy).toEqual({ synthesis: 0, voting: 0 });
		expect(agg.usageByGateway).toEqual([]);
		expect(agg.usageByNode).toEqual({ MELCHIOR: 0, BALTHASAR: 0, CASPAR: 0 });
		expect(agg.voting.total).toBe(0);
		expect(agg.voting.winsByModel).toEqual([]);
		expect(agg.voting.avgPositionBias).toEqual({ avgA: 0, avgB: 0, samples: 0 });
	});

	it('counts runs by strategy across both kinds', () => {
		const agg = aggregate([
			record({ strategy: 'synthesis', voting: undefined }),
			record({ strategy: 'synthesis', voting: undefined }),
			record({ strategy: 'voting' })
		]);
		expect(agg.total).toBe(3);
		expect(agg.byStrategy).toEqual({ synthesis: 2, voting: 1 });
		// Only the voting run contributes to the voting deep-dive.
		expect(agg.voting.total).toBe(1);
	});

	it('tallies usage axes from every responding node, both strategies', () => {
		const agg = aggregate([record({ strategy: 'synthesis', voting: undefined }), record({})]);
		// Two runs × three nodes each → each node participated twice.
		expect(agg.usageByNode).toEqual({ MELCHIOR: 2, BALTHASAR: 2, CASPAR: 2 });
		const gw = Object.fromEntries(agg.usageByGateway.map((e) => [e.key, e.count]));
		expect(gw).toEqual({ anthropic: 2, openai: 2, openrouter: 2 });
		const prov = Object.fromEntries(agg.usageByProvider.map((e) => [e.key, e.count]));
		expect(prov.deepseek).toBe(2);
		// Provider labels resolve through the registry.
		expect(agg.usageByProvider.find((e) => e.key === 'deepseek')?.label).toBe('DeepSeek');
	});

	it('counts voting wins by node and by model separately', () => {
		const agg = aggregate([
			record({ voting: makeVoting({ winner: 'MELCHIOR', winnerModel: 'claude-x' }) }),
			record({ voting: makeVoting({ winner: 'MELCHIOR', winnerModel: 'claude-x' }) }),
			record({ voting: makeVoting({ winner: 'MELCHIOR', winnerModel: 'claude-y' }) }),
			record({ voting: makeVoting({ winner: 'BALTHASAR', winnerModel: 'gpt-x' }) })
		]);
		expect(agg.voting.total).toBe(4);
		expect(agg.voting.winsByNode).toEqual({ MELCHIOR: 3, BALTHASAR: 1, CASPAR: 0 });
		expect(agg.voting.winsByModel.map((w) => `${w.node}:${w.model}:${w.wins}`)).toEqual([
			'MELCHIOR:claude-x:2',
			'MELCHIOR:claude-y:1',
			'BALTHASAR:gpt-x:1'
		]);
	});

	it('derives voting wins by gateway/provider from the winner node identity', () => {
		const agg = aggregate([
			record({ voting: makeVoting({ winner: 'MELCHIOR' }) }), // anthropic
			record({ voting: makeVoting({ winner: 'CASPAR' }) }) // openrouter / deepseek
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
					winner: 'MELCHIOR',
					lengths: { MELCHIOR: 1000, BALTHASAR: 500, CASPAR: 700 }
				})
			}),
			record({
				voting: makeVoting({
					winner: 'BALTHASAR',
					lengths: { MELCHIOR: 200, BALTHASAR: 800, CASPAR: 400 }
				})
			})
		]);
		// Winners: 1000, 800 → avg 900. Losers: 500, 700, 200, 400 → avg 450.
		expect(agg.voting.winnerAvgLength).toBe(900);
		expect(agg.voting.loserAvgLength).toBe(450);
	});
});
