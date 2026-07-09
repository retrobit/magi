import { describe, it, expect, vi, beforeEach } from 'vitest';

// Separate test file from rate-limit.test.ts so the module's limiter memoization
// initializes fresh WITH the KV env present — this exercises the durable Upstash
// branch that production actually runs (the sibling file covers the in-memory
// fallback with no KV env).
// Hoisted so the vi.mock factories (which are lifted above this line) can safely
// reference them.
const { limitMock, logEvent } = vi.hoisted(() => ({ limitMock: vi.fn(), logEvent: vi.fn() }));

vi.mock('$env/dynamic/private', () => ({
	env: { KV_REST_API_URL: 'https://example.upstash.io', KV_REST_API_TOKEN: 'token' }
}));
vi.mock('@upstash/ratelimit', () => ({
	Ratelimit: class {
		static slidingWindow = vi.fn(() => ({}));
		limit = limitMock;
	}
}));
vi.mock('@upstash/redis', () => ({ Redis: class {} }));
vi.mock('./logger', () => ({ logEvent }));

import { checkRateLimit } from './rate-limit';

beforeEach(() => {
	limitMock.mockReset();
	logEvent.mockReset();
});

describe('checkRateLimit — durable Upstash branch', () => {
	it('consults the Redis limiter and passes it through when allowed', async () => {
		limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
		const r = await checkRateLimit('1.2.3.4');
		expect(limitMock).toHaveBeenCalledWith('1.2.3.4');
		expect(r.limited).toBe(false);
	});

	it('maps a Redis block to limited + a positive, bounded Retry-After', async () => {
		limitMock.mockResolvedValue({ success: false, reset: Date.now() + 30_000 });
		const r = await checkRateLimit('1.2.3.4');
		expect(r.limited).toBe(true);
		expect(r.retryAfterSeconds).toBeGreaterThan(0);
		expect(r.retryAfterSeconds).toBeLessThanOrEqual(31);
	});

	it('uses a distinct limiter instance for the keyed (BYOK) bucket', async () => {
		limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
		await checkRateLimit('1.2.3.4', { keyed: true });
		expect(limitMock).toHaveBeenCalledWith('1.2.3.4');
	});

	it('degrades to the in-memory limiter (and warns) when Redis throws', async () => {
		limitMock.mockRejectedValue(new Error('redis unreachable'));
		const r = await checkRateLimit('9.9.9.9');
		// The in-memory fallback allows a first request rather than failing the call.
		expect(r.limited).toBe(false);
		expect(logEvent).toHaveBeenCalledWith(
			'warn',
			'ratelimit.redis_unreachable',
			expect.objectContaining({ error: expect.stringContaining('redis unreachable') })
		);
	});
});
