import type { Handle } from '@sveltejs/kit';

// Security response headers applied to every server-handled response. These are
// the breakage-safe ones — they constrain framing, MIME-sniffing, referrer leak,
// and powerful features, none of which touch script/style execution. A full
// Content-Security-Policy (script-src / style-src) is deliberately NOT set here:
// it is the one header that can silently break this SPA's `style:` directives and
// inline hydration, so it belongs to the Vercel deploy step where it can be
// smoke-tested against the live app in a real browser (a headless build can't
// catch a CSP that blocks rendering). See [[project-live-demo-plan]].
const SECURITY_HEADERS: Record<string, string> = {
	// Block MIME-sniffing (a stripped Content-Type can't be reinterpreted as HTML/JS).
	'X-Content-Type-Options': 'nosniff',
	// Clickjacking: refuse to be framed. CSP frame-ancestors (added at deploy) will
	// supersede this for browsers that honor it; X-Frame-Options covers the rest.
	'X-Frame-Options': 'DENY',
	// Don't leak full URLs (which can carry the query) to cross-origin destinations.
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	// The app needs none of these powerful features; deny them outright.
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
};

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(name, value);
	}
	return response;
};
