import { z } from 'zod';
import { nodeAssignmentSchema } from './validation';
import {
	TIER_NAMES,
	MAGI_NODE_NAMES,
	type TierName,
	type MagiNodeName,
	type ConversationTurn,
	type ScrollMode
} from './types';
import type { NodeAssignment } from './config';
import { STRATEGY_NAMES, type StrategyName } from './consensus/types';

const STORAGE_KEY = 'magi:prefs:v1';
const CONVERSATION_KEY = 'magi:conversation:v1';

/** The slice of per-tier UI state worth surviving a page reload. */
export interface PersistedSnapshot {
	assignments: NodeAssignment[];
	configuredNodes: number[];
	consensusNode: MagiNodeName;
}

/** Global (not per-tier) UI preferences worth surviving a page reload. */
export interface PersistedSettings {
	strategy: StrategyName;
	temperaments: boolean;
	consensusTemperament: boolean;
	temperamentAwareness: boolean;
	genericLabels: boolean;
	theme: 'dark' | 'light';
	bgVariant: 'columns' | 'orbs' | 'off';
	scrollMode: ScrollMode;
}

/** Top-level shape stored in localStorage: the last active tier, a per-tier
 *  snapshot map (so switching tiers never discards saved selections), and the
 *  global UI settings. */
export interface MagiPrefs {
	tier: TierName;
	snapshots: Partial<Record<TierName, PersistedSnapshot>>;
	settings?: PersistedSettings;
}

// Runtime schemas for the localStorage payloads. `nodeAssignmentSchema` is
// shared with the request validator so a stored snapshot and an API request
// agree on what a node assignment is.
const turnUsageSchema = z.object({
	inputTokens: z.number(),
	outputTokens: z.number(),
	cachedTokens: z.number().optional()
});

// Per-node maps use string keys, not `z.enum`: a `z.record` keyed by an enum
// requires *every* node to be present, but these maps are sparse (a node that
// errored has no response, etc.).
const nodeStringRecord = z.record(z.string(), z.string());

const persistedSnapshotSchema = z.object({
	assignments: z.tuple([nodeAssignmentSchema, nodeAssignmentSchema, nodeAssignmentSchema]),
	configuredNodes: z.array(z.number()),
	consensusNode: z.enum(MAGI_NODE_NAMES)
});

const persistedSettingsSchema = z.object({
	strategy: z.enum(STRATEGY_NAMES),
	temperaments: z.boolean(),
	consensusTemperament: z.boolean(),
	temperamentAwareness: z.boolean(),
	genericLabels: z.boolean(),
	theme: z.enum(['dark', 'light']),
	bgVariant: z.enum(['columns', 'orbs', 'off']),
	scrollMode: z.enum(['off', 'follow', 'snap'])
});

const debateRoundSchema = z.object({
	round: z.number(),
	prompt: z.string(),
	response: z.string()
});

const conversationTurnSchema = z.object({
	query: z.string(),
	nodeResponses: nodeStringRecord,
	nodeErrors: nodeStringRecord,
	consensus: z.string(),
	consensusNode: z.enum(MAGI_NODE_NAMES),
	nodeUsage: z.record(z.string(), turnUsageSchema),
	consensusUsage: turnUsageSchema.optional(),
	strategy: z.string().optional(),
	debateRounds: z.record(z.string(), z.array(debateRoundSchema)).optional()
});

function storageAvailable(): boolean {
	try {
		return typeof localStorage !== 'undefined';
	} catch {
		// Accessing localStorage can throw in some privacy modes.
		return false;
	}
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
			const result = persistedSnapshotSchema.safeParse(rawSnapshots[t]);
			if (result.success) snapshots[t] = result.data;
		}

		// `settings` is optional — payloads saved before it existed simply omit
		// it, and a malformed slice is dropped without losing tier or snapshots.
		const prefs: MagiPrefs = { tier: parsed.tier as TierName, snapshots };
		const settings = persistedSettingsSchema.safeParse(parsed.settings);
		if (settings.success) prefs.settings = settings.data;
		return prefs;
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
			if (
				Array.isArray(turns) &&
				turns.every((turn) => conversationTurnSchema.safeParse(turn).success)
			) {
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
