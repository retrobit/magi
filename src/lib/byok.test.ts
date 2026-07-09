import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// BYOK_ENABLED reads PUBLIC_BYOK_ENABLED at import; the storage helpers under
// test don't need it, but the module import does.
vi.mock('$env/dynamic/public', () => ({ env: {} as Record<string, string | undefined> }));

import { loadByokKeys, saveByokKeys } from './byok';

const STORAGE_KEY = 'magi:byok:v1';

/** Minimal in-memory localStorage stand-in for the Node test environment. */
class MemoryStorage {
	private m = new Map<string, string>();
	getItem(k: string) {
		return this.m.has(k) ? this.m.get(k)! : null;
	}
	setItem(k: string, v: string) {
		this.m.set(k, v);
	}
	removeItem(k: string) {
		this.m.delete(k);
	}
}

beforeEach(() => {
	(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});
afterEach(() => {
	delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('BYOK client storage', () => {
	it('round-trips valid keys', () => {
		saveByokKeys({ anthropic: 'sk-ant-abcdefghij', openai: 'sk-abcdefghij' });
		expect(loadByokKeys()).toEqual({
			anthropic: 'sk-ant-abcdefghij',
			openai: 'sk-abcdefghij'
		});
	});

	it('drops blank fields and removes the entry entirely when all are blank', () => {
		saveByokKeys({ anthropic: '   ', openai: '' });
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(loadByokKeys()).toEqual({});
	});

	it('keeps the valid keys when one stored field is malformed (all-or-nothing regression)', () => {
		// A too-short key (e.g. from an older build) must NOT wipe every other saved
		// key on load — the previous whole-object safeParse did exactly that.
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ anthropic: 'sk-ant-abcdefghij', openai: 'short' })
		);
		expect(loadByokKeys()).toEqual({ anthropic: 'sk-ant-abcdefghij' });
	});

	it('returns {} for corrupt JSON rather than throwing', () => {
		localStorage.setItem(STORAGE_KEY, '{not valid json');
		expect(loadByokKeys()).toEqual({});
	});

	it('no-ops safely when storage is unavailable', () => {
		delete (globalThis as { localStorage?: unknown }).localStorage;
		expect(loadByokKeys()).toEqual({});
		expect(() => saveByokKeys({ anthropic: 'sk-ant-abcdefghij' })).not.toThrow();
	});
});
