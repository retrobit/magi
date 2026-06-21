import { describe, it, expect } from 'vitest';
import { seededShuffle, makePeerOrderer } from './peer-order';
import type { MagiNodeName } from '../types';

const NODES: { node: MagiNodeName }[] = [
	{ node: 'MAGI_1' },
	{ node: 'MAGI_2' },
	{ node: 'MAGI_3' }
];

describe('seededShuffle', () => {
	it('is deterministic for a given seed', () => {
		const a = seededShuffle([1, 2, 3, 4, 5], 42);
		const b = seededShuffle([1, 2, 3, 4, 5], 42);
		expect(a).toEqual(b);
	});

	it('returns a permutation of the input (no drops, no dupes)', () => {
		const input = [1, 2, 3, 4, 5, 6, 7, 8];
		const out = seededShuffle(input, 99);
		expect([...out].sort((x, y) => x - y)).toEqual(input);
	});

	it('does not mutate the input array', () => {
		const input = [1, 2, 3, 4, 5];
		seededShuffle(input, 7);
		expect(input).toEqual([1, 2, 3, 4, 5]);
	});

	it('produces different orderings for at least some different seeds', () => {
		const base = seededShuffle([1, 2, 3, 4, 5], 0).join(',');
		const differs = Array.from({ length: 50 }, (_, s) =>
			seededShuffle([1, 2, 3, 4, 5], s).join(',')
		);
		expect(differs.some((o) => o !== base)).toBe(true);
	});

	it('handles trivial lengths without error', () => {
		expect(seededShuffle([], 1)).toEqual([]);
		expect(seededShuffle([42], 1)).toEqual([42]);
	});
});

describe('makePeerOrderer', () => {
	it('is the identity when no seed is supplied (strict node order preserved)', () => {
		const order = makePeerOrderer(NODES, undefined);
		const peers = [{ node: 'MAGI_2' as const }, { node: 'MAGI_3' as const }];
		expect(order(peers)).toBe(peers); // same reference — untouched
	});

	it('orders any peer subset by the turn-wide seat order', () => {
		const seed = 12345;
		const order = makePeerOrderer(NODES, seed);
		// The seat order is the shuffle of the full responder set; every subset must
		// agree with that single ranking.
		const seatRank = new Map(seededShuffle(NODES, seed).map((r, i) => [r.node, i]));
		const peers = [{ node: 'MAGI_3' as const }, { node: 'MAGI_1' as const }];
		const ordered = order(peers).map((p) => p.node);
		const expected = [...peers]
			.map((p) => p.node)
			.sort((a, b) => (seatRank.get(a) ?? 0) - (seatRank.get(b) ?? 0));
		expect(ordered).toEqual(expected);
	});

	it('is stable: the same subset orders identically on repeated calls (round stability)', () => {
		const order = makePeerOrderer(NODES, 777);
		const peers = [{ node: 'MAGI_1' as const }, { node: 'MAGI_3' as const }];
		expect(order(peers)).toEqual(order(peers));
	});

	it('does not mutate the subset it is handed', () => {
		const order = makePeerOrderer(NODES, 5);
		const peers = [{ node: 'MAGI_3' as const }, { node: 'MAGI_2' as const }];
		const snapshot = peers.map((p) => p.node);
		order(peers);
		expect(peers.map((p) => p.node)).toEqual(snapshot);
	});

	it('rotates slot A across nodes over many seeds (washes out position bias)', () => {
		// For each seed, slot A of MAGI_1's two peers is whichever of MAGI_2 /
		// MAGI_3 sits earlier in that turn's seat order. Over many seeds, both nodes
		// should land in slot A a healthy fraction of the time — not one always.
		const slotA = { MAGI_2: 0, MAGI_3: 0 } as Record<string, number>;
		for (let seed = 0; seed < 200; seed += 1) {
			const order = makePeerOrderer(NODES, seed);
			const peers = [{ node: 'MAGI_2' as const }, { node: 'MAGI_3' as const }];
			slotA[order(peers)[0].node] += 1;
		}
		expect(slotA.MAGI_2).toBeGreaterThan(50);
		expect(slotA.MAGI_3).toBeGreaterThan(50);
	});
});
