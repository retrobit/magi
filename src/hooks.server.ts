import type { Handle } from '@sveltejs/kit';

// Security response headers applied to every server-handled response. These
// constrain framing, MIME-sniffing, referrer leak, and powerful features. The
// script/style Content-Security-Policy lives in svelte.config.js `kit.csp`
// instead — it needs SvelteKit to hash its own inline bootstrap script, which
// only the framework can do; setting it by hand here would force 'unsafe-inline'
// on script-src and defeat the point.
const SECURITY_HEADERS: Record<string, string> = {
	// Block MIME-sniffing (a stripped Content-Type can't be reinterpreted as HTML/JS).
	'X-Content-Type-Options': 'nosniff',
	// Clickjacking: refuse to be framed. Belt and braces with the CSP's
	// frame-ancestors 'none' (svelte.config.js), for anything that reads only this.
	'X-Frame-Options': 'DENY',
	// Don't leak full URLs (which can carry the query) to cross-origin destinations.
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	// The app needs none of these powerful features; deny them outright.
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
};

// The SPA shell (route '/') is identical for every visitor of a deployment: ssr is
// off, the CSP is hash-mode (the hash travels in the cached headers) and the public
// env is inlined per deployment. Vercel's CDN cache key includes the host and the
// unique deployment URL, so a cached shell can neither outlive its deployment's
// assets nor cross Production/Preview. Only a 200 is cached — never an error.
const SHELL_CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event, {
		// Keep JS modulepreloads but drop CSS from the Link preload header: the
		// ~1 KB SPA shell already carries its <link rel="stylesheet"> tags, so the
		// preload buys nothing, and Firefox logs a spurious "preload was not used"
		// warning for every header-preloaded stylesheet.
		preload: ({ type }) => type === 'js'
	});
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(name, value);
	}
	if (event.route.id === '/' && response.status === 200) {
		response.headers.set('cache-control', SHELL_CACHE_CONTROL);
	}
	return response;
};
