import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Deploy to Vercel as Node serverless functions (NOT edge) so the
		// /api/magi SSE stream can run long — Multi-Round Debate on slow free
		// models routinely streams >60s. Per-route maxDuration lives in
		// src/routes/api/magi/+server.ts; >60s on Hobby needs Fluid Compute
		// enabled in the Vercel dashboard (see DEPLOY.md).
		//
		// runtime is pinned: the adapter otherwise infers it from the local build
		// Node version, which fails on a Node it doesn't recognize. nodejs22.x is
		// Vercel's current default and supports the SSE streaming we need.
		adapter: adapter({ runtime: 'nodejs22.x' }),

		// Content-Security-Policy. mode:'hash' makes SvelteKit emit a hash for its
		// own inline bootstrap <script> and fold it into script-src — without that a
		// bare `script-src 'self'` would block hydration and render a blank SPA.
		// style-src keeps 'unsafe-inline': Svelte `style:` directives and Tailwind set
		// element styles at runtime, and the XSS surface of styles is far smaller than
		// scripts. All resources are same-origin (self-hosted fonts, no external CDNs);
		// data: covers inline SVG/img data URIs. Framing stays on X-Frame-Options
		// (frame-ancestors is ignored in the <meta> CSP SvelteKit injects).
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:'],
				'font-src': ['self'],
				'connect-src': ['self'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'object-src': ['none']
			}
		}
	}
};

export default config;
