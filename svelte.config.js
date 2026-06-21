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
		adapter: adapter({ runtime: 'nodejs22.x' })
	}
};

export default config;
