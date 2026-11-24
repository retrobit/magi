import { describe, it, expect } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { handle } from './hooks.server';

const SHELL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400';

function run(routeId: string | null, status = 200) {
	const event = { route: { id: routeId } } as unknown as RequestEvent;
	const resolve = async () => new Response('x', { status });
	return handle({ event, resolve } as unknown as Parameters<typeof handle>[0]);
}

describe('handle', () => {
	it('lets the CDN cache the SPA shell', async () => {
		expect((await run('/')).headers.get('cache-control')).toBe(SHELL);
	});

	it('does not cache a non-200 shell response', async () => {
		expect((await run('/', 500)).headers.get('cache-control')).toBeNull();
	});

	it('leaves other routes alone', async () => {
		expect((await run('/api/magi/budget')).headers.get('cache-control')).toBeNull();
		expect((await run(null, 404)).headers.get('cache-control')).toBeNull();
	});

	it('still applies the security headers', async () => {
		for (const route of ['/', '/api/magi']) {
			const headers = (await run(route)).headers;
			expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
			expect(headers.get('X-Frame-Options')).toBe('DENY');
			expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
			expect(headers.get('Permissions-Policy')).toContain('camera=()');
		}
	});
});
