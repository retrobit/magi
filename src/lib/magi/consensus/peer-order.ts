// Per-turn peer-order randomization.
//
// Voting jurors and debate peers see their rivals anonymized as Candidate/Peer
// A, B, … Presenting them in fixed node order makes MELCHIOR perpetually "slot
// A", and the stats panel's position-bias readout shows jurors reward whoever
// sits there. A seeded shuffle rotates the seating each turn so that bias washes
// out across runs — while staying fully deterministic given a seed, so a single
// debate's rounds keep a stable A/B mapping and unit tests stay reproducible.
//
// When the seed is `undefined` the ordering is the identity (strict node order),
// preserving the original behavior — that's the path unit tests take unless they
// opt into a seed. The server supplies a fresh random seed per request, so real
// runs always shuffle.

import type { MagiNodeName } from '../types';

// mulberry32 — a tiny, fast, well-distributed 32-bit PRNG seeded from one int.
// Deterministic: the same seed always yields the same sequence.
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** FNV-1a hash of a string → a 32-bit seed. Lets a stable string (e.g. a query)
 *  stand in as a reproducible seed when an explicit one isn't supplied. */
export function seedFromString(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i += 1) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** Fisher–Yates shuffle driven by a seeded PRNG. Returns a new array; the input
 *  is left untouched. Same seed + same input ⇒ same permutation. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
	const out = items.slice();
	const rand = mulberry32(seed);
	for (let i = out.length - 1; i > 0; i -= 1) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** Build a reusable "seating" function for one consensus turn.
 *
 *  Given the full set of responding nodes and a seed, it returns a function that
 *  reorders any subset of peers into this turn's seat order (the order their
 *  anonymized A/B/… labels are then assigned in). Because the seat order is fixed
 *  for the whole turn, every call — every juror, every debate round — agrees on
 *  who sits where, so a peer keeps the same letter across rounds.
 *
 *  With `seed === undefined` the returned function is the identity (node order
 *  preserved), matching the pre-randomization behavior. */
export function makePeerOrderer<T extends { node: MagiNodeName }>(
	responses: readonly T[],
	seed: number | undefined
): (peers: T[]) => T[] {
	if (seed === undefined) return (peers) => peers;
	const rank = new Map<MagiNodeName, number>();
	seededShuffle(responses, seed).forEach((r, i) => rank.set(r.node, i));
	return (peers) => [...peers].sort((a, b) => (rank.get(a.node) ?? 0) - (rank.get(b.node) ?? 0));
}
