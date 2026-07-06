import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkRateLimit } from './rate-limit';

// No Upstash env is set in tests, so checkRateLimit resolves to the in-memory
// fallback. The limiter keeps module-level per-IP state with no reset hook, so
// each test uses a unique IP to stay isolated from the others.
let ipCounter = 0;
function freshIp(): string {
	return `10.0.0.${ipCounter++}`;
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('checkRateLimit (in-memory fallback)', () => {
	it('allows the first request from an IP', async () => {
		expect((await checkRateLimit(freshIp())).limited).toBe(false);
	});

	it('allows up to 10 requests inside the window', async () => {
		const ip = freshIp();
		for (let i = 0; i < 10; i++) {
			expect((await checkRateLimit(ip)).limited).toBe(false);
		}
	});

	it('blocks the 11th request inside the window', async () => {
		const ip = freshIp();
		for (let i = 0; i < 10; i++) await checkRateLimit(ip);
		expect((await checkRateLimit(ip)).limited).toBe(true);
	});

	it('reports a positive, bounded Retry-After when limited', async () => {
		const ip = freshIp();
		for (let i = 0; i < 10; i++) await checkRateLimit(ip);
		const res = await checkRateLimit(ip);
		expect(res.limited).toBe(true);
		expect(res.retryAfterSeconds).toBeGreaterThan(0);
		expect(res.retryAfterSeconds).toBeLessThanOrEqual(60);
	});

	it('tracks each IP independently', async () => {
		const a = freshIp();
		const b = freshIp();
		for (let i = 0; i < 10; i++) await checkRateLimit(a);
		expect((await checkRateLimit(a)).limited).toBe(true);
		expect((await checkRateLimit(b)).limited).toBe(false);
	});

	it('allows requests again once the window has elapsed', async () => {
		const ip = freshIp();
		for (let i = 0; i < 10; i++) await checkRateLimit(ip);
		expect((await checkRateLimit(ip)).limited).toBe(true);

		vi.advanceTimersByTime(60_001);
		expect((await checkRateLimit(ip)).limited).toBe(false);
	});

	it('still counts a request made partway through the window', async () => {
		const ip = freshIp();
		for (let i = 0; i < 5; i++) await checkRateLimit(ip);

		// Half the window later, the earlier five are still in scope.
		vi.advanceTimersByTime(30_000);
		for (let i = 0; i < 5; i++) await checkRateLimit(ip);
		expect((await checkRateLimit(ip)).limited).toBe(true);

		// Past the original five expiring, but the later five remain.
		vi.advanceTimersByTime(30_001);
		expect((await checkRateLimit(ip)).limited).toBe(false);
	});
});
