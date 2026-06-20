import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	loadPrefs,
	savePrefs,
	clearPrefs,
	loadConversations,
	saveConversations,
	clearConversations,
	type MagiPrefs,
	type PersistedSettings
} from './persistence';
import type { ConversationTurn } from './types';

// Storage keys mirror the (unexported) constants in persistence.ts.
const STORAGE_KEY = 'magi:prefs:v1';
const CONVERSATION_KEY = 'magi:conversation:v1';

/** Minimal in-memory localStorage stand-in for the Node test environment. */
class MemoryStorage {
	private store = new Map<string, string>();
	getItem(key: string): string | null {
		return this.store.has(key) ? this.store.get(key)! : null;
	}
	setItem(key: string, value: string): void {
		this.store.set(key, String(value));
	}
	removeItem(key: string): void {
		this.store.delete(key);
	}
}

function installStorage(storage: object): void {
	(globalThis as { localStorage?: unknown }).localStorage = storage;
}

function removeStorage(): void {
	delete (globalThis as { localStorage?: unknown }).localStorage;
}

const validPrefs: MagiPrefs = {
	tier: 'balanced',
	snapshots: {
		balanced: {
			assignments: [
				{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', modelId: 'opus' },
				{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', modelId: 'gpt' },
				{ node: 'MAGI_3', gateway: 'google', provider: 'google', modelId: 'gemini' }
			],
			configuredNodes: [0, 1, 2],
			consensusNode: 'MAGI_1'
		}
	}
};

const validSettings: PersistedSettings = {
	strategy: 'voting',
	temperaments: true,
	consensusTemperament: false,
	temperamentAwareness: true,
	genericLabels: false,
	theme: 'light',
	bgVariant: 'columns',
	scrollMode: 'snap'
};

const validTurn: ConversationTurn = {
	query: 'prior question',
	nodeResponses: { MAGI_1: 'an answer' },
	nodeErrors: {},
	consensus: 'prior consensus',
	consensusNode: 'MAGI_1',
	nodeUsage: { MAGI_1: { inputTokens: 10, outputTokens: 20 } }
};

beforeEach(() => {
	installStorage(new MemoryStorage());
});

afterEach(() => {
	removeStorage();
});

describe('loadPrefs / savePrefs', () => {
	it('round-trips a valid prefs object', () => {
		savePrefs(validPrefs);
		expect(loadPrefs()).toEqual(validPrefs);
	});

	it('returns null when nothing is stored', () => {
		expect(loadPrefs()).toBeNull();
	});

	it('returns null when stored JSON is unparseable', () => {
		localStorage.setItem(STORAGE_KEY, '{not valid json');
		expect(loadPrefs()).toBeNull();
	});

	it('returns null when the tier is invalid', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ tier: 'premium', snapshots: {} }));
		expect(loadPrefs()).toBeNull();
	});

	it('returns null when snapshots is missing', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ tier: 'balanced' }));
		expect(loadPrefs()).toBeNull();
	});

	it('drops snapshots that fail validation but keeps valid ones', () => {
		const mixed = {
			tier: 'balanced',
			snapshots: {
				balanced: validPrefs.snapshots.balanced,
				free: { assignments: 'not an array' }
			}
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(mixed));
		const result = loadPrefs();
		expect(result?.snapshots.balanced).toEqual(validPrefs.snapshots.balanced);
		expect(result?.snapshots.free).toBeUndefined();
	});

	it('drops a snapshot whose assignments count is not 3', () => {
		const bad = {
			tier: 'balanced',
			snapshots: {
				balanced: {
					assignments: [validPrefs.snapshots.balanced!.assignments[0]],
					configuredNodes: [0],
					consensusNode: 'MAGI_1'
				}
			}
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
		expect(loadPrefs()?.snapshots.balanced).toBeUndefined();
	});

	it('round-trips the settings slice', () => {
		savePrefs({ ...validPrefs, settings: validSettings });
		expect(loadPrefs()?.settings).toEqual(validSettings);
	});

	it('loads prefs saved before the settings slice existed', () => {
		savePrefs(validPrefs);
		const result = loadPrefs();
		expect(result?.tier).toBe('balanced');
		expect(result?.settings).toBeUndefined();
	});

	it('drops a malformed settings slice but keeps tier and snapshots', () => {
		const bad = {
			tier: 'balanced',
			snapshots: validPrefs.snapshots,
			settings: { strategy: 'synthesis', theme: 'neon' }
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
		const result = loadPrefs();
		expect(result?.snapshots.balanced).toEqual(validPrefs.snapshots.balanced);
		expect(result?.settings).toBeUndefined();
	});

	it('returns null when storage is unavailable', () => {
		removeStorage();
		expect(loadPrefs()).toBeNull();
	});

	it('savePrefs is a no-op when storage is unavailable', () => {
		removeStorage();
		expect(() => savePrefs(validPrefs)).not.toThrow();
	});

	it('savePrefs swallows a quota-exceeded error', () => {
		installStorage({
			getItem: () => null,
			setItem: () => {
				throw new Error('QuotaExceededError');
			},
			removeItem: () => {}
		});
		expect(() => savePrefs(validPrefs)).not.toThrow();
	});
});

describe('clearPrefs', () => {
	it('removes stored prefs', () => {
		savePrefs(validPrefs);
		clearPrefs();
		expect(loadPrefs()).toBeNull();
	});

	it('is a no-op when storage is unavailable', () => {
		removeStorage();
		expect(() => clearPrefs()).not.toThrow();
	});
});

describe('loadConversations / saveConversations', () => {
	it('round-trips conversations keyed by tier', () => {
		const conversations = { balanced: [validTurn] };
		saveConversations(conversations);
		expect(loadConversations()).toEqual(conversations);
	});

	it('returns an empty object when nothing is stored', () => {
		expect(loadConversations()).toEqual({});
	});

	it('migrates legacy node ids in a saved conversation turn', () => {
		localStorage.setItem(
			CONVERSATION_KEY,
			JSON.stringify({
				balanced: [
					{
						query: 'q',
						nodeResponses: { MELCHIOR: 'a', CASPAR: 'c' },
						nodeErrors: {},
						consensus: 'done',
						consensusNode: 'MELCHIOR',
						nodeUsage: { MELCHIOR: { inputTokens: 1, outputTokens: 2 } }
					}
				]
			})
		);
		const turn = loadConversations().balanced?.[0];
		expect(turn?.consensusNode).toBe('MAGI_1');
		expect(Object.keys(turn!.nodeResponses)).toEqual(['MAGI_1', 'MAGI_3']);
		expect(Object.keys(turn!.nodeUsage)).toEqual(['MAGI_1']);
	});

	it('returns an empty object when stored JSON is unparseable', () => {
		localStorage.setItem(CONVERSATION_KEY, 'not json');
		expect(loadConversations()).toEqual({});
	});

	it('drops a tier whose every turn is invalid', () => {
		const mixed = {
			balanced: [validTurn],
			free: [{ query: 'incomplete turn' }]
		};
		localStorage.setItem(CONVERSATION_KEY, JSON.stringify(mixed));
		const result = loadConversations();
		expect(result.balanced).toEqual([validTurn]);
		// `free` has no parseable turns, so it filters to empty and is omitted.
		expect(result.free).toBeUndefined();
	});

	it('keeps the valid turns in a tier and drops only the invalid ones', () => {
		// A single corrupt or forward-incompatible turn must not wipe a tier's
		// entire saved history — the parseable turns around it survive.
		localStorage.setItem(
			CONVERSATION_KEY,
			JSON.stringify({ balanced: [validTurn, { query: 'incomplete turn' }, validTurn] })
		);
		expect(loadConversations().balanced).toEqual([validTurn, validTurn]);
	});

	it('drops a tier whose value is not an array', () => {
		localStorage.setItem(CONVERSATION_KEY, JSON.stringify({ balanced: 'nope' }));
		expect(loadConversations().balanced).toBeUndefined();
	});

	it('returns an empty object when storage is unavailable', () => {
		removeStorage();
		expect(loadConversations()).toEqual({});
	});

	it('saveConversations is a no-op when storage is unavailable', () => {
		removeStorage();
		expect(() => saveConversations({ balanced: [validTurn] })).not.toThrow();
	});

	it('saveConversations swallows a quota-exceeded error', () => {
		installStorage({
			getItem: () => null,
			setItem: () => {
				throw new Error('QuotaExceededError');
			},
			removeItem: () => {}
		});
		expect(() => saveConversations({ balanced: [validTurn] })).not.toThrow();
	});
});

describe('clearConversations', () => {
	it('removes all stored conversations', () => {
		saveConversations({ balanced: [validTurn] });
		clearConversations();
		expect(loadConversations()).toEqual({});
	});

	it('is a no-op when storage is unavailable', () => {
		removeStorage();
		expect(() => clearConversations()).not.toThrow();
	});
});

describe('loadPrefs / savePrefs — settings optional fields', () => {
	it('round-trips a settings slice including palette, layoutFocus, and reduceMotion', () => {
		const settings: PersistedSettings = {
			...validSettings,
			palette: 'nebula',
			layoutFocus: 'nodes',
			reduceMotion: true
		};
		savePrefs({ ...validPrefs, settings });
		const loaded = loadPrefs();
		expect(loaded?.settings?.palette).toBe('nebula');
		expect(loaded?.settings?.layoutFocus).toBe('nodes');
		expect(loaded?.settings?.reduceMotion).toBe(true);
	});

	it('round-trips the autoLayout flag', () => {
		savePrefs({ ...validPrefs, settings: { ...validSettings, autoLayout: false } });
		expect(loadPrefs()?.settings?.autoLayout).toBe(false);
	});

	it('round-trips a sparse customTemperaments override', () => {
		const customTemperaments = {
			MAGI_1: { label: 'Skeptic', prompt: 'You doubt every claim.' }
		};
		savePrefs({ ...validPrefs, settings: { ...validSettings, customTemperaments } });
		expect(loadPrefs()?.settings?.customTemperaments).toEqual(customTemperaments);
	});

	it('drops the settings slice when a customTemperaments prompt exceeds the cap', () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				...validPrefs,
				settings: {
					...validSettings,
					customTemperaments: { MAGI_3: { label: 'X', prompt: 'y'.repeat(5000) } }
				}
			})
		);
		// The over-cap prompt fails schema validation, so the whole settings slice is
		// dropped (tier + snapshots survive).
		expect(loadPrefs()?.settings).toBeUndefined();
	});

	it('migrates a legacy palette: "eva" stored in settings loads as "nebula"', () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				...validPrefs,
				settings: { ...validSettings, palette: 'eva' }
			})
		);
		const result = loadPrefs();
		expect(result?.settings?.palette).toBe('nebula');
	});

	it('migrates legacy node ids (MELCHIOR/BALTHASAR/CASPAR) in a saved snapshot', () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				tier: 'balanced',
				snapshots: {
					balanced: {
						assignments: [
							{ node: 'MELCHIOR', gateway: 'anthropic', provider: 'anthropic', modelId: 'opus' },
							{ node: 'BALTHASAR', gateway: 'openai', provider: 'openai', modelId: 'gpt' },
							{ node: 'CASPAR', gateway: 'google', provider: 'google', modelId: 'gemini' }
						],
						configuredNodes: [0, 1, 2],
						consensusNode: 'CASPAR'
					}
				}
			})
		);
		const snap = loadPrefs()?.snapshots.balanced;
		expect(snap?.consensusNode).toBe('MAGI_3');
		expect(snap?.assignments.map((a) => a.node)).toEqual(['MAGI_1', 'MAGI_2', 'MAGI_3']);
	});

	it('migrates legacy node-keyed customTemperaments', () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				...validPrefs,
				settings: {
					...validSettings,
					customTemperaments: { BALTHASAR: { label: 'Guardian', prompt: 'Protect.' } }
				}
			})
		);
		expect(loadPrefs()?.settings?.customTemperaments).toEqual({
			MAGI_2: { label: 'Guardian', prompt: 'Protect.' }
		});
	});

	it('round-trips the motionMode field', () => {
		const settings: PersistedSettings = { ...validSettings, motionMode: 'normal' };
		savePrefs({ ...validPrefs, settings });
		expect(loadPrefs()?.settings?.motionMode).toBe('normal');
	});

	it('round-trips the opinionated and collaborative flags', () => {
		const settings: PersistedSettings = {
			...validSettings,
			opinionated: true,
			collaborative: true
		};
		savePrefs({ ...validPrefs, settings });
		const loaded = loadPrefs();
		expect(loaded?.settings?.opinionated).toBe(true);
		expect(loaded?.settings?.collaborative).toBe(true);
	});

	it('round-trips the debateRounds field', () => {
		const settings: PersistedSettings = { ...validSettings, debateRounds: 4 };
		savePrefs({ ...validPrefs, settings });
		expect(loadPrefs()?.settings?.debateRounds).toBe(4);
	});

	it('drops the settings slice when debateRounds is out of range', () => {
		const bad = {
			tier: 'balanced',
			snapshots: validPrefs.snapshots,
			settings: { ...validSettings, debateRounds: 99 }
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
		expect(loadPrefs()?.settings).toBeUndefined();
	});

	it('drops the whole settings slice when palette is invalid, but keeps tier and snapshots', () => {
		// A stored payload whose settings contain an invalid palette value fails
		// persistedSettingsSchema.safeParse — the settings key is omitted from the
		// returned MagiPrefs while tier and snapshots still load normally.
		const bad = {
			tier: 'balanced',
			snapshots: validPrefs.snapshots,
			settings: { ...validSettings, palette: 'neon' }
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
		const result = loadPrefs();
		expect(result?.tier).toBe('balanced');
		expect(result?.snapshots.balanced).toEqual(validPrefs.snapshots.balanced);
		expect(result?.settings).toBeUndefined();
	});
});

describe('conversationTurnSchema — extended fields', () => {
	it('round-trips a turn with error, consensusWarning, and aborted', () => {
		const turn: ConversationTurn = {
			...validTurn,
			error: 'All models failed to respond',
			consensusWarning: 'Only 2 of 3 models responded — consensus is based on partial data.',
			aborted: true
		};
		saveConversations({ balanced: [turn] });
		const loaded = loadConversations();
		expect(loaded.balanced?.[0].error).toBe('All models failed to respond');
		expect(loaded.balanced?.[0].consensusWarning).toContain('Only 2 of 3');
		expect(loaded.balanced?.[0].aborted).toBe(true);
	});

	it('round-trips a turn without the optional fields (back-compat)', () => {
		// A turn saved before the new fields existed should still load cleanly.
		saveConversations({ balanced: [validTurn] });
		const loaded = loadConversations();
		expect(loaded.balanced?.[0].error).toBeUndefined();
		expect(loaded.balanced?.[0].consensusWarning).toBeUndefined();
		expect(loaded.balanced?.[0].aborted).toBeUndefined();
	});

	it('drops a tier whose turns contain an unknown boolean value for aborted', () => {
		// Non-boolean `aborted` should fail the schema — the whole tier is dropped.
		const bad = {
			balanced: [{ ...validTurn, aborted: 'yes' }]
		};
		localStorage.setItem('magi:conversation:v1', JSON.stringify(bad));
		expect(loadConversations().balanced).toBeUndefined();
	});
});
