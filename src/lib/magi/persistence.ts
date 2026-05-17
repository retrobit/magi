import type { NodeAssignment } from './config';
import { TIER_NAMES, type TierName, type MagiNodeName, type ConversationTurn } from './types';

const STORAGE_KEY = 'magi:prefs:v1';
const CONVERSATION_KEY = 'magi:conversation:v1';

/** The slice of per-tier UI state worth surviving a page reload. */
export interface PersistedSnapshot {
	assignments: NodeAssignment[];
	configuredNodes: number[];
	consensusNode: MagiNodeName;
}

/** Top-level shape stored in localStorage: the last active tier plus a
 *  per-tier snapshot map, so switching tiers never discards saved selections. */
export interface MagiPrefs {
	tier: TierName;
	snapshots: Partial<Record<TierName, PersistedSnapshot>>;
}

function storageAvailable(): boolean {
	try {
		return typeof localStorage !== 'undefined';
	} catch {
		// Accessing localStorage can throw in some privacy modes.
		return false;
	}
}

function isValidSnapshot(value: unknown): value is PersistedSnapshot {
	if (!value || typeof value !== 'object') return false;
	const s = value as Record<string, unknown>;
	if (!Array.isArray(s.assignments) || s.assignments.length !== 3) return false;
	for (const a of s.assignments) {
		if (!a || typeof a !== 'object') return false;
		const na = a as Record<string, unknown>;
		if (
			typeof na.node !== 'string' ||
			typeof na.gateway !== 'string' ||
			typeof na.provider !== 'string' ||
			typeof na.modelId !== 'string'
		) {
			return false;
		}
	}
	if (!Array.isArray(s.configuredNodes)) return false;
	if (typeof s.consensusNode !== 'string') return false;
	return true;
}

/** Read saved preferences, returning null when absent, unparseable, or malformed.
 *  Individual tier snapshots that fail validation are dropped silently. */
export function loadPrefs(): MagiPrefs | null {
	if (!storageAvailable()) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (!parsed || typeof parsed !== 'object') return null;
		if (!TIER_NAMES.includes(parsed.tier as TierName)) return null;
		if (!parsed.snapshots || typeof parsed.snapshots !== 'object') return null;

		const rawSnapshots = parsed.snapshots as Record<string, unknown>;
		const snapshots: Partial<Record<TierName, PersistedSnapshot>> = {};
		for (const t of TIER_NAMES) {
			const snap = rawSnapshots[t];
			if (isValidSnapshot(snap)) snapshots[t] = snap;
		}
		return { tier: parsed.tier as TierName, snapshots };
	} catch {
		return null;
	}
}

/** Persist preferences. No-ops if storage is unavailable or the quota is hit. */
export function savePrefs(prefs: MagiPrefs): void {
	if (!storageAvailable()) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
	} catch {
		// Quota exceeded or storage disabled — non-fatal, fall back to in-memory.
	}
}

/** Discard all saved preferences (used by a "reset to defaults" affordance). */
export function clearPrefs(): void {
	if (!storageAvailable()) return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Non-fatal.
	}
}

function isValidTurn(value: unknown): value is ConversationTurn {
	if (!value || typeof value !== 'object') return false;
	const t = value as Record<string, unknown>;
	return (
		typeof t.query === 'string' &&
		typeof t.consensus === 'string' &&
		typeof t.consensusNode === 'string' &&
		!!t.nodeResponses &&
		typeof t.nodeResponses === 'object' &&
		!!t.nodeErrors &&
		typeof t.nodeErrors === 'object' &&
		!!t.nodeUsage &&
		typeof t.nodeUsage === 'object'
	);
}

/** Read saved conversations, keyed by tier. Malformed turns/tiers are dropped. */
export function loadConversations(): Partial<Record<TierName, ConversationTurn[]>> {
	if (!storageAvailable()) return {};
	try {
		const raw = localStorage.getItem(CONVERSATION_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (!parsed || typeof parsed !== 'object') return {};
		const out: Partial<Record<TierName, ConversationTurn[]>> = {};
		for (const t of TIER_NAMES) {
			const turns = parsed[t];
			if (Array.isArray(turns) && turns.every(isValidTurn)) {
				out[t] = turns as ConversationTurn[];
			}
		}
		return out;
	} catch {
		return {};
	}
}

/** Persist conversations keyed by tier. No-ops if storage is unavailable. */
export function saveConversations(
	conversations: Partial<Record<TierName, ConversationTurn[]>>
): void {
	if (!storageAvailable()) return;
	try {
		localStorage.setItem(CONVERSATION_KEY, JSON.stringify(conversations));
	} catch {
		// Quota exceeded or storage disabled — non-fatal.
	}
}
