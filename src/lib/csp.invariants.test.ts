import { describe, it, expect } from 'vitest';
import config from '../../svelte.config.js';

// The strict Content-Security-Policy is the app's exfiltration barrier for
// untrusted model HTML (see Markdown.svelte). A well-meaning future edit that
// loosens a directive — adding a CDN to script-src, an analytics host to
// connect-src, 'unsafe-eval' — would silently widen that hole. These invariants
// make such a change fail CI loudly instead.
describe('CSP invariants (svelte.config.js)', () => {
	const csp = config.kit?.csp;

	it('is configured in hash mode', () => {
		// hash mode lets SvelteKit allow its own inline bootstrap without
		// 'unsafe-inline' on script-src — the whole reason a strict policy works.
		expect(csp?.mode).toBe('hash');
	});

	it('locks script-src to self — no unsafe-inline, no unsafe-eval, no remote hosts', () => {
		expect(csp?.directives?.['script-src']).toEqual(['self']);
	});

	it('keeps connect-src same-origin so a script cannot beacon data out', () => {
		expect(csp?.directives?.['connect-src']).toEqual(['self']);
	});

	it('holds every other resource directive to same-origin (+ data: images, none for objects)', () => {
		const d = csp?.directives ?? {};
		expect(d['default-src']).toEqual(['self']);
		expect(d['img-src']).toEqual(['self', 'data:']);
		expect(d['font-src']).toEqual(['self']);
		expect(d['base-uri']).toEqual(['self']);
		expect(d['form-action']).toEqual(['self']);
		expect(d['object-src']).toEqual(['none']);
	});

	it('allows inline styles only (Svelte style: + Tailwind runtime), nothing remote', () => {
		expect(csp?.directives?.['style-src']).toEqual(['self', 'unsafe-inline']);
	});
});
