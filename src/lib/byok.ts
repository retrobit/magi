import { env } from '$env/dynamic/public';
import { byokKeysSchema, type ByokKeys } from '$lib/magi/byok';

/**
 * True on deployments that accept visitor-supplied provider keys
 * (`PUBLIC_BYOK_ENABLED=true`). Gates the settings-panel key fields AND is
 * checked server-side, so the feature is fully inert — UI and API — anywhere
 * the flag is unset (including the public demo). Same runtime-public-env
 * pattern as `DEMO_MODE` in `$lib/demo`.
 */
export const BYOK_ENABLED = env.PUBLIC_BYOK_ENABLED === 'true';

// Keys live in their OWN storage entry, apart from `magi:prefs`/`magi:conversation`,
// so they can never ride along in a state export or a prefs reset.
const STORAGE_KEY = 'magi:byok:v1';

function storageAvailable(): boolean {
	try {
		return typeof localStorage !== 'undefined';
	} catch {
		// Accessing localStorage can throw in some privacy modes.
		return false;
	}
}

/** Read the saved keys; invalid or absent payloads resolve to an empty object. */
export function loadByokKeys(): ByokKeys {
	if (!storageAvailable()) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = byokKeysSchema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : {};
	} catch {
		return {};
	}
}

/** Persist the keys, dropping blank fields; an all-blank set removes the entry. */
export function saveByokKeys(keys: Partial<Record<keyof ByokKeys, string>>): void {
	if (!storageAvailable()) return;
	const pruned: Record<string, string> = {};
	for (const [gateway, value] of Object.entries(keys)) {
		const trimmed = value?.trim();
		if (trimmed) pruned[gateway] = trimmed;
	}
	try {
		if (Object.keys(pruned).length === 0) localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
	} catch {
		// Quota/privacy-mode write failures degrade to session-only keys.
	}
}
