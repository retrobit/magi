import { browser } from '$app/environment';
import type { HLJSApi } from 'highlight.js';

// Reactive handle to the syntax highlighter. Null until the (dynamically
// imported) curated grammar bundle finishes loading. A code fence can't exist
// before the first model token, so loading after first paint costs nothing
// visible: components that render a fence read `highlighter()` inside their
// render effect, so they re-highlight automatically the moment it resolves.
let hljs = $state<HLJSApi | null>(null);
let started = false;

/** Kick off the one-time async load of the grammar bundle (browser only). Safe
 *  to call from every Markdown instance — the `started` guard dedupes. */
export function ensureHighlighter(): void {
	if (started || !browser) return;
	started = true;
	void import('./highlight-bundle').then((mod) => {
		hljs = mod.default;
	});
}

/** Reactive read: the loaded highlighter, or null while it's still loading. */
export function highlighter(): HLJSApi | null {
	return hljs;
}
