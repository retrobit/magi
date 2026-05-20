import { describe, it, expect, beforeEach } from 'vitest';
import {
	loadVotingStats,
	appendVotingStat,
	clearVotingStats,
	aggregate,
	type VotingStatRecord
} from './voting-stats';
import type { VotingStats } from './consensus/types';

const STORAGE_KEY = 'magi:voting-stats:v1';

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

function makeStats(overrides: Partial<VotingStats> = {}): VotingStats {
	return {
		strategy: 'voting',
		winner: 'MELCHIOR',
		winnerModel: 'claude-x',
		winnerTotal: 15,
		tiebreak: 'none',
		totals: { MELCHIOR: 15, BALTHASAR: 10, CASPAR: 5 },
		lengths: { MELCHIOR: 1000, BALTHASAR: 800, CASPAR: 1200 },
		models: { MELCHIOR: 'claude-x', BALTHASAR: 'gpt-x', CASPAR: 'gemini-x' },
		jurors: [],
		positionBias: { avgA: 7, avgB: 5, n: 4 },
		config: { tier: 'balanced', temperaments: false, consensusTemperament: false },
		...overrides
	};
}

beforeEach(() => {
	const mem = new MemoryStorage();
	// jsdom isn't the test env for this file (server project), so stub the global.
	(globalThis as { window?: { localStorage: Storage } }).window = { localStorage: mem };
	mem.clear();
});

describe('voting-stats persistence', () => {
	it('returns an empty list when nothing has been stored', () => {
		expect(loadVotingStats()).toEqual([]);
	});

	it('appends a record and reads it back', () => {
		appendVotingStat(makeStats());
		const records = loadVotingStats();
		expect(records).toHaveLength(1);
		expect(records[0].stats.winner).toBe('MELCHIOR');
		expect(typeof records[0].ts).toBe('number');
	});

	it('caps the history at the 500 most recent records', () => {
		for (let i = 0; i < 510; i += 1) {
			appendVotingStat(makeStats({ winnerTotal: i }));
		}
		const records = loadVotingStats();
		expect(records).toHaveLength(500);
		// Oldest 10 were dropped — the first remaining record's total is 10.
		expect(records[0].stats.winnerTotal).toBe(10);
		expect(records.at(-1)?.stats.winnerTotal).toBe(509);
	});

	it('clears the history', () => {
		appendVotingStat(makeStats());
		clearVotingStats();
		expect(loadVotingStats()).toEqual([]);
	});

	it('drops a malformed payload silently rather than throwing', () => {
		(globalThis as { window?: { localStorage: Storage } }).window!.localStorage.setItem(
			STORAGE_KEY,
			'{not valid json'
		);
		expect(loadVotingStats()).toEqual([]);
	});

	it('drops a version-mismatched payload silently', () => {
		(globalThis as { window?: { localStorage: Storage } }).window!.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ version: 99, records: [] })
		);
		expect(loadVotingStats()).toEqual([]);
	});
});

describe('voting-stats aggregate', () => {
	function record(stats: Partial<VotingStats>, ts = 0): VotingStatRecord {
		return { ts, stats: makeStats(stats) };
	}

	it('returns zeros for an empty input', () => {
		const agg = aggregate([]);
		expect(agg.total).toBe(0);
		expect(agg.winsByNode).toEqual({ MELCHIOR: 0, BALTHASAR: 0, CASPAR: 0 });
		expect(agg.winsByModel).toEqual([]);
		expect(agg.avgPositionBias).toEqual({ avgA: 0, avgB: 0, samples: 0 });
	});

	it('counts wins by node and by model separately', () => {
		const agg = aggregate([
			record({ winner: 'MELCHIOR', winnerModel: 'claude-x' }),
			record({ winner: 'MELCHIOR', winnerModel: 'claude-x' }),
			record({ winner: 'MELCHIOR', winnerModel: 'claude-y' }),
			record({ winner: 'BALTHASAR', winnerModel: 'gpt-x' })
		]);
		expect(agg.total).toBe(4);
		expect(agg.winsByNode).toEqual({ MELCHIOR: 3, BALTHASAR: 1, CASPAR: 0 });
		// Sorted by win count descending.
		expect(agg.winsByModel.map((w) => `${w.node}:${w.model}:${w.wins}`)).toEqual([
			'MELCHIOR:claude-x:2',
			'MELCHIOR:claude-y:1',
			'BALTHASAR:gpt-x:1'
		]);
	});

	it('weights position-bias averages by the number of samples per vote', () => {
		const agg = aggregate([
			record({ positionBias: { avgA: 8, avgB: 4, n: 4 } }),
			// Low-n vote contributes proportionally less, not equally.
			record({ positionBias: { avgA: 2, avgB: 9, n: 1 } })
		]);
		// avgA = (8*4 + 2*1) / 5 = 34/5 = 6.8
		expect(agg.avgPositionBias.avgA).toBeCloseTo(6.8, 5);
		// avgB = (4*4 + 9*1) / 5 = 25/5 = 5.0
		expect(agg.avgPositionBias.avgB).toBeCloseTo(5.0, 5);
		expect(agg.avgPositionBias.samples).toBe(5);
	});

	it('tallies tiebreak paths', () => {
		const agg = aggregate([
			record({ tiebreak: 'none' }),
			record({ tiebreak: 'none' }),
			record({ tiebreak: 'best-score' }),
			record({ tiebreak: 'node-order' }),
			record({ tiebreak: 'walkover' })
		]);
		expect(agg.tiebreakDistribution).toEqual({
			none: 2,
			'best-score': 1,
			'node-order': 1,
			walkover: 1
		});
	});

	it('computes winner-vs-loser average lengths from per-vote lengths maps', () => {
		const agg = aggregate([
			record({
				winner: 'MELCHIOR',
				lengths: { MELCHIOR: 1000, BALTHASAR: 500, CASPAR: 700 }
			}),
			record({
				winner: 'BALTHASAR',
				lengths: { MELCHIOR: 200, BALTHASAR: 800, CASPAR: 400 }
			})
		]);
		// Winners: 1000, 800 → avg 900. Losers: 500, 700, 200, 400 → avg 450.
		expect(agg.winnerAvgLength).toBe(900);
		expect(agg.loserAvgLength).toBe(450);
	});
});
