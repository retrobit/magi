import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		// Coverage counts only files the tests actually import (v8 default), so the
		// largely view-only Svelte components don't drag the numbers down. Thresholds
		// are a ratchet floor — set deliberately below current levels so a normal
		// change can't drop coverage below them. Raise the floor as coverage climbs;
		// never let a change drop below it.
		coverage: {
			provider: 'v8',
			reporter: ['text-summary', 'html'],
			thresholds: { statements: 85, lines: 85, functions: 85, branches: 72 },
			exclude: [
				'**/*.config.*',
				'**/*.test.ts',
				'.svelte-kit/**',
				'src/vitest-setup-client.ts',
				'src/lib/index.ts',
				'src/app.d.ts'
			]
		},
		// Two projects: Svelte components render in a jsdom DOM, everything else
		// (server routes, pure modules) runs in plain Node.
		projects: [
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],
				test: {
					name: 'client',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.svelte.test.ts'],
					setupFiles: ['./src/vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.test.ts'],
					exclude: ['src/**/*.svelte.test.ts']
				}
			}
		]
	}
});
