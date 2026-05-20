// Client-side voting-stats history — dev-only telemetry that captures every
// `vote-stats` SSE event into localStorage so the dev stats panel can show
// long-running patterns (wins by node, position bias, tiebreak rates).
//
// All reads are defensive: malformed or older payloads silently return an
// empty list rather than throwing. There's no Zod schema here because this
// data only matters to the dev panel — corrupting it is a non-issue.

import type { VotingStats } from './consensus/types';
import type { MagiNodeName } from './types';

const STORAGE_KEY = 'magi:voting-stats:v1';
const MAX_RECORDS = 500;

export interface VotingStatRecord {
	ts: number;
	stats: VotingStats;
}

interface StoredEnvelope {
	version: 1;
	records: VotingStatRecord[];
}

function safeStorage(): Storage | null {
	try {
		return typeof window !== 'undefined' ? window.localStorage : null;
	} catch {
		return null;
	}
}

export function loadVotingStats(): VotingStatRecord[] {
	const ls = safeStorage();
	if (!ls) return [];
	try {
		const raw = ls.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as StoredEnvelope;
		if (parsed?.version !== 1 || !Array.isArray(parsed.records)) return [];
		return parsed.records;
	} catch {
		return [];
	}
}

export function appendVotingStat(stats: VotingStats): void {
	const ls = safeStorage();
	if (!ls) return;
	const existing = loadVotingStats();
	const next = [...existing, { ts: Date.now(), stats }].slice(-MAX_RECORDS);
	try {
		const envelope: StoredEnvelope = { version: 1, records: next };
		ls.setItem(STORAGE_KEY, JSON.stringify(envelope));
	} catch {
		// localStorage full or unavailable — silently drop. Stats are informational.
	}
}

export function clearVotingStats(): void {
	safeStorage()?.removeItem(STORAGE_KEY);
}

// ---------- aggregation helpers (pure, easy to test) ----------

export interface AggregatedStats {
	total: number;
	winsByNode: Record<MagiNodeName, number>;
	winsByModel: { model: string; node: MagiNodeName; wins: number }[];
	avgPositionBias: { avgA: number; avgB: number; samples: number };
	tiebreakDistribution: Record<VotingStats['tiebreak'], number>;
	winnerAvgLength: number;
	loserAvgLength: number;
}

export function aggregate(records: VotingStatRecord[]): AggregatedStats {
	const winsByNode = { MELCHIOR: 0, BALTHASAR: 0, CASPAR: 0 } as Record<MagiNodeName, number>;
	const tiebreakDistribution = {
		none: 0,
		'best-score': 0,
		'node-order': 0,
		walkover: 0
	} as Record<VotingStats['tiebreak'], number>;
	const winsByModelKey = new Map<string, { model: string; node: MagiNodeName; wins: number }>();

	let aSum = 0;
	let bSum = 0;
	let biasSamples = 0;
	let winnerLengthSum = 0;
	let loserLengthSum = 0;
	let loserLengthCount = 0;

	for (const { stats } of records) {
		winsByNode[stats.winner] = (winsByNode[stats.winner] ?? 0) + 1;
		tiebreakDistribution[stats.tiebreak] = (tiebreakDistribution[stats.tiebreak] ?? 0) + 1;

		const modelKey = `${stats.winner}|${stats.winnerModel}`;
		const prev = winsByModelKey.get(modelKey);
		winsByModelKey.set(modelKey, {
			model: stats.winnerModel,
			node: stats.winner,
			wins: (prev?.wins ?? 0) + 1
		});

		// positionBias is already an average for that one vote — re-weighted by
		// the number of samples that contributed so a low-n vote doesn't dominate.
		if (stats.positionBias.n > 0) {
			aSum += stats.positionBias.avgA * stats.positionBias.n;
			bSum += stats.positionBias.avgB * stats.positionBias.n;
			biasSamples += stats.positionBias.n;
		}

		winnerLengthSum += stats.lengths[stats.winner] ?? 0;
		for (const [node, length] of Object.entries(stats.lengths) as [MagiNodeName, number][]) {
			if (node !== stats.winner) {
				loserLengthSum += length;
				loserLengthCount += 1;
			}
		}
	}

	const winsByModel = [...winsByModelKey.values()].sort((a, b) => b.wins - a.wins);

	return {
		total: records.length,
		winsByNode,
		winsByModel,
		avgPositionBias: {
			avgA: biasSamples > 0 ? aSum / biasSamples : 0,
			avgB: biasSamples > 0 ? bSum / biasSamples : 0,
			samples: biasSamples
		},
		tiebreakDistribution,
		winnerAvgLength: records.length > 0 ? winnerLengthSum / records.length : 0,
		loserAvgLength: loserLengthCount > 0 ? loserLengthSum / loserLengthCount : 0
	};
}
