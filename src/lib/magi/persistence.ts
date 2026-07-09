import * as z from 'zod/mini';
import { nodeAssignmentSchema } from './validation';
import {
	TIER_NAMES,
	MAGI_NODE_NAMES,
	BG_VARIANTS,
	PALETTES,
	MOTION_MODES,
	type TierName,
	type MagiNodeName,
	type ConversationTurn,
	type ScrollMode,
	type BgVariant,
	type Palette,
	type MotionMode
} from './types';
import type { NodeAssignment } from './config';
import {
	STRATEGY_NAMES,
	MIN_DEBATE_ROUNDS,
	MAX_DEBATE_ROUNDS,
	type StrategyName
} from './consensus/types';
import {
	MAX_TEMPERAMENT_LABEL,
	MAX_TEMPERAMENT_PROMPT,
	type CustomTemperaments
} from './temperaments';

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
	/** Multi-Round Debate round ceiling. Optional for back-compat — older payloads
	 *  fall back to the in-code default. */
	debateRounds?: number;
	temperaments: boolean;
	consensusTemperament: boolean;
	temperamentAwareness: boolean;
	/** Per-node temperament overrides (edited personas). Optional/sparse — absent
	 *  nodes keep their built-in temperament. */
	customTemperaments?: CustomTemperaments;
	/** Opinionated / Collaborative deliberation toggles. Optional for back-compat —
	 *  older payloads fall back to the in-code defaults (both off). */
	opinionated?: boolean;
	collaborative?: boolean;
	genericLabels: boolean;
	theme: 'dark' | 'light';
	bgVariant: BgVariant;
	/** Color palette. Optional for back-compat — older payloads fall back to the
	 *  in-code default (`nebula`). */
	palette?: Palette;
	scrollMode: ScrollMode;
	/** Focus accordion state. Optional for back-compat with payloads saved
	 *  before this field existed — those simply fall back to the in-code default. */
	layoutFocus?: 'balanced' | 'nodes' | 'consensus';
	/** Auto-layout: let the focus accordion follow the run lifecycle (nodes while
	 *  they think → balanced while consensus streams → consensus when done).
	 *  Optional for back-compat; older payloads fall back to the in-code default (on). */
	autoLayout?: boolean;
	/** Motion preference (`normal` | `full` | `reduced`). Optional for back-compat;
	 *  payloads without it fall back to the in-code default (`normal`). */
	motionMode?: MotionMode;
	/** Legacy boolean superseded by `motionMode`; still read (true → reduced,
	 *  false → full) so old payloads migrate, but no longer written. */
	reduceMotion?: boolean;
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
	cachedTokens: z.optional(z.number())
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
	debateRounds: z.optional(
		z.number().check(z.int(), z.gte(MIN_DEBATE_ROUNDS), z.lte(MAX_DEBATE_ROUNDS))
	),
	temperaments: z.boolean(),
	consensusTemperament: z.boolean(),
	temperamentAwareness: z.boolean(),
	customTemperaments: z.optional(
		z.partialRecord(
			z.enum(MAGI_NODE_NAMES),
			z.object({
				label: z.string().check(z.maxLength(MAX_TEMPERAMENT_LABEL)),
				prompt: z.string().check(z.maxLength(MAX_TEMPERAMENT_PROMPT))
			})
		)
	),
	opinionated: z.optional(z.boolean()),
	collaborative: z.optional(z.boolean()),
	genericLabels: z.boolean(),
	theme: z.enum(['dark', 'light']),
	bgVariant: z.enum(BG_VARIANTS),
	palette: z.optional(z.enum(PALETTES)),
	scrollMode: z.enum(['off', 'follow', 'snap']),
	layoutFocus: z.optional(z.enum(['balanced', 'nodes', 'consensus'])),
	autoLayout: z.optional(z.boolean()),
	motionMode: z.optional(z.enum(MOTION_MODES)),
	reduceMotion: z.optional(z.boolean())
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
	debateVerdict: z.optional(z.enum(['consensus', 'split', 'walkover'])),
	debateSummary: z.optional(z.string()),
	debateRounds: z.optional(z.record(z.string(), z.array(debateRoundSchema))),
	error: z.optional(z.string()),
	consensusWarning: z.optional(z.string()),
	aborted: z.optional(z.boolean())
});

// One-time node-identifier migration. The three MAGI seats were renamed from
// their former code names to numbered ids; old saved payloads carry the former
// ids both as enum values (consensusNode, assignment.node) and as object keys
// (nodeResponses, customTemperaments, …), so remap them before schema validation
// — which now only accepts the new ids — or saved configs/conversations would be
// silently dropped on first load after the rename.
const LEGACY_NODE_IDS: Record<string, MagiNodeName> = {
	MELCHIOR: 'MAGI_1',
	BALTHASAR: 'MAGI_2',
	CASPAR: 'MAGI_3'
};

function migrateNodeId(value: unknown): unknown {
	return typeof value === 'string' && value in LEGACY_NODE_IDS ? LEGACY_NODE_IDS[value] : value;
}

/** Remap the keys of a node-keyed record (nodeResponses, customTemperaments, …). */
function migrateNodeKeys(value: unknown): unknown {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		out[migrateNodeId(k) as string] = v;
	}
	return out;
}

function migrateSnapshot(raw: unknown): unknown {
	if (!raw || typeof raw !== 'object') return raw;
	const next = { ...(raw as Record<string, unknown>) };
	if ('consensusNode' in next) next.consensusNode = migrateNodeId(next.consensusNode);
	if (Array.isArray(next.assignments)) {
		next.assignments = next.assignments.map((a) =>
			a && typeof a === 'object'
				? {
						...(a as Record<string, unknown>),
						node: migrateNodeId((a as Record<string, unknown>).node)
					}
				: a
		);
	}
	return next;
}

function migrateTurn(raw: unknown): unknown {
	if (!raw || typeof raw !== 'object') return raw;
	const next = { ...(raw as Record<string, unknown>) };
	if ('consensusNode' in next) next.consensusNode = migrateNodeId(next.consensusNode);
	for (const key of ['nodeResponses', 'nodeErrors', 'nodeUsage', 'debateRounds'] as const) {
		if (key in next) next[key] = migrateNodeKeys(next[key]);
	}
	return next;
}

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
			const result = persistedSnapshotSchema.safeParse(migrateSnapshot(rawSnapshots[t]));
			if (result.success) snapshots[t] = result.data;
		}

		// `settings` is optional — payloads saved before it existed simply omit
		// it, and a malformed slice is dropped without losing tier or snapshots.
		const prefs: MagiPrefs = { tier: parsed.tier as TierName, snapshots };

		// One-time rename migration: `palette: 'eva'` was renamed to 'nebula'.
		// Rewrite before validation so the enum check doesn't drop the whole slice.
		let rawSettings = parsed.settings;
		if (rawSettings && typeof rawSettings === 'object') {
			const rs = rawSettings as Record<string, unknown>;
			rawSettings = {
				...rs,
				// `palette: 'eva'` was renamed to 'nebula'.
				...(rs.palette === 'eva' ? { palette: 'nebula' } : {}),
				// Custom-temperament overrides are keyed by node id — migrate the keys.
				...(rs.customTemperaments
					? { customTemperaments: migrateNodeKeys(rs.customTemperaments) }
					: {})
			};
		}

		const settings = persistedSettingsSchema.safeParse(rawSettings);
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
			if (!Array.isArray(turns)) continue;
			const migrated = turns.map(migrateTurn);
			// Drop only the turns that fail validation, not the whole thread — one
			// corrupt or forward-incompatible turn shouldn't wipe a tier's entire
			// saved history. Matches the per-snapshot resilience in loadPrefs.
			const valid = migrated.filter((turn) => conversationTurnSchema.safeParse(turn).success);
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
	if (!storageAvailable()) return;
	try {
		localStorage.setItem(CONVERSATION_KEY, JSON.stringify(conversations));
	} catch {
		// Quota exceeded or storage disabled — non-fatal.
	}
}

/** Discard all saved conversations across every tier (used by "reset to defaults"). */
export function clearConversations(): void {
	if (!storageAvailable()) return;
	try {
		localStorage.removeItem(CONVERSATION_KEY);
	} catch {
		// Non-fatal.
	}
}
