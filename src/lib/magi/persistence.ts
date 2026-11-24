import * as z from 'zod/mini';
import { assignmentsSchema, debateRoundsSchema, temperamentOverrideSchema } from './validation';
import {
	TIER_NAMES,
	MAGI_NODE_NAMES,
	BG_VARIANTS,
	PALETTES,
	MOTION_MODES,
	SCROLL_MODES,
	LAYOUT_FOCUSES,
	DEBATE_VERDICTS,
	THEMES,
	type TierName,
	type MagiNodeName,
	type ConversationTurn
} from './types';
import type { NodeAssignment } from './config';
import { STRATEGY_NAMES } from './consensus/types';

const STORAGE_KEY = 'magi:prefs:v1';
const CONVERSATION_KEY = 'magi:conversation:v1';

/** The slice of per-tier UI state worth surviving a page reload. */
export interface PersistedSnapshot {
	assignments: NodeAssignment[];
	configuredNodes: number[];
	consensusNode: MagiNodeName;
}

/** Global (not per-tier) UI preferences worth surviving a page reload. */
export type PersistedSettings = z.infer<typeof persistedSettingsSchema>;

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
	cachedTokens: z.optional(z.number())
});

// Per-node maps use string keys, not `z.enum`: a `z.record` keyed by an enum
// requires *every* node to be present, but these maps are sparse (a node that
// errored has no response, etc.).
const nodeStringRecord = z.record(z.string(), z.string());

const persistedSnapshotSchema = z.object({
	assignments: assignmentsSchema,
	configuredNodes: z.array(z.number()),
	consensusNode: z.enum(MAGI_NODE_NAMES)
});

// The persisted settings shape is derived from this schema (PersistedSettings),
// so a new setting is declared once, here. Fields marked "optional for back-compat"
// are absent from payloads saved before they existed and fall back to the page's
// in-code default.
const persistedSettingsSchema = z.object({
	strategy: z.enum(STRATEGY_NAMES),
	/** Multi-Round Debate round ceiling. */
	debateRounds: z.optional(debateRoundsSchema),
	temperaments: z.boolean(),
	consensusTemperament: z.boolean(),
	temperamentAwareness: z.boolean(),
	/** Per-node temperament overrides (edited personas). Sparse — absent nodes
	 *  keep their built-in temperament. */
	customTemperaments: z.optional(
		z.partialRecord(z.enum(MAGI_NODE_NAMES), temperamentOverrideSchema)
	),
	/** Opinionated / Collaborative deliberation toggles (both default off). */
	opinionated: z.optional(z.boolean()),
	collaborative: z.optional(z.boolean()),
	/** Reasoning toggle (default on). */
	reasoning: z.optional(z.boolean()),
	genericLabels: z.boolean(),
	theme: z.enum(THEMES),
	bgVariant: z.enum(BG_VARIANTS),
	/** Color palette (default `nebula`). */
	palette: z.optional(z.enum(PALETTES)),
	scrollMode: z.enum(SCROLL_MODES),
	/** Focus accordion state. */
	layoutFocus: z.optional(z.enum(LAYOUT_FOCUSES)),
	/** Auto-layout: let the focus accordion follow the run lifecycle (nodes while
	 *  they think → balanced while consensus streams → consensus when done).
	 *  Defaults on. */
	autoLayout: z.optional(z.boolean()),
	/** Motion preference (`normal` | `full` | `reduced`; default `normal`). */
	motionMode: z.optional(z.enum(MOTION_MODES))
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
	consensusUsage: z.optional(turnUsageSchema),
	strategy: z.optional(z.string()),
	debateVerdict: z.optional(z.enum(DEBATE_VERDICTS)),
	debateSummary: z.optional(z.string()),
	debateRounds: z.optional(z.record(z.string(), z.array(debateRoundSchema))),
	error: z.optional(z.string()),
	consensusWarning: z.optional(z.string()),
	aborted: z.optional(z.boolean())
});

/** Read saved preferences, returning null when absent, unparseable, or malformed.
 *  Individual tier snapshots that fail validation are dropped silently. */
export function loadPrefs(): MagiPrefs | null {
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
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
	} catch {
		// Quota exceeded or storage disabled — non-fatal, fall back to in-memory.
	}
}

/** Discard all saved preferences (used by a "reset to defaults" affordance). */
export function clearPrefs(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Non-fatal.
	}
}

/** Read saved conversations, keyed by tier. Malformed turns/tiers are dropped. */
export function loadConversations(): Partial<Record<TierName, ConversationTurn[]>> {
	try {
		const raw = localStorage.getItem(CONVERSATION_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (!parsed || typeof parsed !== 'object') return {};
		const out: Partial<Record<TierName, ConversationTurn[]>> = {};
		for (const t of TIER_NAMES) {
			const turns = parsed[t];
			if (!Array.isArray(turns)) continue;
			// Drop only the turns that fail validation, not the whole thread — one
			// corrupt or forward-incompatible turn shouldn't wipe a tier's entire
			// saved history. Matches the per-snapshot resilience in loadPrefs.
			const valid = turns.filter((turn) => conversationTurnSchema.safeParse(turn).success);
			if (valid.length > 0) {
				out[t] = valid as ConversationTurn[];
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
	try {
		localStorage.setItem(CONVERSATION_KEY, JSON.stringify(conversations));
	} catch {
		// Quota exceeded or storage disabled — non-fatal.
	}
}

/** Discard all saved conversations across every tier (used by "reset to defaults"). */
export function clearConversations(): void {
	try {
		localStorage.removeItem(CONVERSATION_KEY);
	} catch {
		// Non-fatal.
	}
}
