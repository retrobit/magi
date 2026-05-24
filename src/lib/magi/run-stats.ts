// Client-side run-stats history — telemetry that captures every `run-stats`
// SSE event into localStorage so the stats panel can surface long-running
// patterns: how runs split across strategies/gateways/providers/models/nodes,
// and (for Structured Voting runs) wins, position bias, and tiebreak rates.
//
// All reads are defensive: malformed or older payloads silently return an
// empty list rather than throwing. There's no Zod schema here because this
// data only feeds an informational panel — corrupting it is a non-issue.

import type { NodeIdentity, RunStats, StrategyName } from './consensus/types';
import { GATEWAY_LABELS, getProviderLabel, type GatewayName, type MagiNodeName } from './types';

const STORAGE_KEY = 'magi:run-stats:v1';
const MAX_RECORDS = 500;

export interface RunStatRecord {
	ts: number;
	stats: RunStats;
}

interface StoredEnvelope {
	version: 1;
	records: RunStatRecord[];
}

function safeStorage(): Storage | null {
	try {
		return typeof window !== 'undefined' ? window.localStorage : null;
	} catch {
		return null;
	}
}

export function loadRunStats(): RunStatRecord[] {
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

export function appendRunStat(stats: RunStats): void {
	const ls = safeStorage();
	if (!ls) return;
	const existing = loadRunStats();
	const next = [...existing, { ts: Date.now(), stats }].slice(-MAX_RECORDS);
	try {
		const envelope: StoredEnvelope = { version: 1, records: next };
		ls.setItem(STORAGE_KEY, JSON.stringify(envelope));
	} catch {
		// localStorage full or unavailable — silently drop. Stats are informational.
	}
}

export function clearRunStats(): void {
	safeStorage()?.removeItem(STORAGE_KEY);
}

// ---------- aggregation helpers (pure, easy to test) ----------

type VotingTiebreak = NonNullable<RunStats['voting']>['tiebreak'];

/** A tally keyed by some axis (gateway/provider/model), sorted high-to-low.
 *  `count` doubles as a win count in the voting breakdowns. */
export interface CountEntry {
	key: string;
	label: string;
	count: number;
}

export interface VotingAggregate {
	/** Number of records that carried voting metrics. */
	total: number;
	winsByNode: Record<MagiNodeName, number>;
	winsByModel: { model: string; node: MagiNodeName; wins: number }[];
	winsByGateway: CountEntry[];
	winsByProvider: CountEntry[];
	avgPositionBias: { avgA: number; avgB: number; samples: number };
	tiebreakDistribution: Record<VotingTiebreak, number>;
	winnerAvgLength: number;
	loserAvgLength: number;
}

export interface AggregatedStats {
	/** Total runs recorded, across every strategy. */
	total: number;
	byStrategy: Record<StrategyName, number>;
	usageByGateway: CountEntry[];
	usageByProvider: CountEntry[];
	usageByModel: CountEntry[];
	usageByNode: Record<MagiNodeName, number>;
	/** Voting-only breakdowns, computed over the subset of runs that have them. */
	voting: VotingAggregate;
}

function bump(map: Map<string, CountEntry>, key: string, label: string): void {
	const prev = map.get(key);
	map.set(key, { key, label, count: (prev?.count ?? 0) + 1 });
}

function sortedEntries(map: Map<string, CountEntry>): CountEntry[] {
	return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function gatewayLabel(g: string): string {
	return GATEWAY_LABELS[g as GatewayName] ?? g;
}

export function aggregate(records: RunStatRecord[]): AggregatedStats {
	const byStrategy = { synthesis: 0, voting: 0 } as Record<StrategyName, number>;
	const usageByNode = { MELCHIOR: 0, BALTHASAR: 0, CASPAR: 0 } as Record<MagiNodeName, number>;
	const usageGateway = new Map<string, CountEntry>();
	const usageProvider = new Map<string, CountEntry>();
	const usageModel = new Map<string, CountEntry>();

	const winsByNode = { MELCHIOR: 0, BALTHASAR: 0, CASPAR: 0 } as Record<MagiNodeName, number>;
	const winsGateway = new Map<string, CountEntry>();
	const winsProvider = new Map<string, CountEntry>();
	const winsModelKey = new Map<string, { model: string; node: MagiNodeName; wins: number }>();
	const tiebreakDistribution = {
		none: 0,
		'best-score': 0,
		'node-order': 0,
		walkover: 0
	} as Record<VotingTiebreak, number>;

	let votingTotal = 0;
	let aSum = 0;
	let bSum = 0;
	let biasSamples = 0;
	let winnerLengthSum = 0;
	let loserLengthSum = 0;
	let loserLengthCount = 0;

	for (const { stats } of records) {
		byStrategy[stats.strategy] = (byStrategy[stats.strategy] ?? 0) + 1;

		// Usage axes — every responding node in the run contributes one tally.
		for (const [node, id] of Object.entries(stats.nodes) as [
			MagiNodeName,
			NodeIdentity | undefined
		][]) {
			if (!id) continue;
			usageByNode[node] = (usageByNode[node] ?? 0) + 1;
			bump(usageGateway, id.gateway, gatewayLabel(id.gateway));
			bump(usageProvider, id.provider, getProviderLabel(id.provider));
			bump(usageModel, id.model, id.model);
		}

		// Voting-only metrics.
		const v = stats.voting;
		if (!v) continue;
		votingTotal += 1;
		winsByNode[v.winner] = (winsByNode[v.winner] ?? 0) + 1;
		tiebreakDistribution[v.tiebreak] = (tiebreakDistribution[v.tiebreak] ?? 0) + 1;

		const modelKey = `${v.winner}|${v.winnerModel}`;
		const prevModel = winsModelKey.get(modelKey);
		winsModelKey.set(modelKey, {
			model: v.winnerModel,
			node: v.winner,
			wins: (prevModel?.wins ?? 0) + 1
		});

		// Winner's gateway/provider come from this run's own node identities.
		const winnerId = stats.nodes[v.winner];
		if (winnerId) {
			bump(winsGateway, winnerId.gateway, gatewayLabel(winnerId.gateway));
			bump(winsProvider, winnerId.provider, getProviderLabel(winnerId.provider));
		}

		// positionBias is already an average for that one vote — re-weighted by
		// the number of samples that contributed so a low-n vote doesn't dominate.
		if (v.positionBias.n > 0) {
			aSum += v.positionBias.avgA * v.positionBias.n;
			bSum += v.positionBias.avgB * v.positionBias.n;
			biasSamples += v.positionBias.n;
		}

		winnerLengthSum += v.lengths[v.winner] ?? 0;
		for (const [node, length] of Object.entries(v.lengths) as [MagiNodeName, number][]) {
			if (node !== v.winner) {
				loserLengthSum += length;
				loserLengthCount += 1;
			}
		}
	}

	return {
		total: records.length,
		byStrategy,
		usageByGateway: sortedEntries(usageGateway),
		usageByProvider: sortedEntries(usageProvider),
		usageByModel: sortedEntries(usageModel),
		usageByNode,
		voting: {
			total: votingTotal,
			winsByNode,
			winsByModel: [...winsModelKey.values()].sort((a, b) => b.wins - a.wins),
			winsByGateway: sortedEntries(winsGateway),
			winsByProvider: sortedEntries(winsProvider),
			avgPositionBias: {
				avgA: biasSamples > 0 ? aSum / biasSamples : 0,
				avgB: biasSamples > 0 ? bSum / biasSamples : 0,
				samples: biasSamples
			},
			tiebreakDistribution,
			winnerAvgLength: votingTotal > 0 ? winnerLengthSum / votingTotal : 0,
			loserAvgLength: loserLengthCount > 0 ? loserLengthSum / loserLengthCount : 0
		}
	};
}
