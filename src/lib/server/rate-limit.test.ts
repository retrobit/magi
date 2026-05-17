import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isRateLimited } from './rate-limit';

// The limiter keeps module-level per-IP state with no reset hook, so each
// test uses a unique IP to stay isolated from the others.
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

describe('isRateLimited', () => {
	it('allows the first request from an IP', () => {
		expect(isRateLimited(freshIp())).toBe(false);
	});

	it('allows up to 10 requests inside the window', () => {
		const ip = freshIp();
		for (let i = 0; i < 10; i++) {
			expect(isRateLimited(ip)).toBe(false);
		}
	});

	it('blocks the 11th request inside the window', () => {
		const ip = freshIp();
		for (let i = 0; i < 10; i++) isRateLimited(ip);
		expect(isRateLimited(ip)).toBe(true);
	});

	it('keeps blocking while the IP stays over the limit', () => {
		const ip = freshIp();
		for (let i = 0; i < 10; i++) isRateLimited(ip);
		expect(isRateLimited(ip)).toBe(true);
		expect(isRateLimited(ip)).toBe(true);
	});

	it('tracks each IP independently', () => {
		const a = freshIp();
		const b = freshIp();
		for (let i = 0; i < 10; i++) isRateLimited(a);
		expect(isRateLimited(a)).toBe(true);
		expect(isRateLimited(b)).toBe(false);
	});

	it('allows requests again once the window has elapsed', () => {
		const ip = freshIp();
		for (let i = 0; i < 10; i++) isRateLimited(ip);
		expect(isRateLimited(ip)).toBe(true);

		vi.advanceTimersByTime(60_001);
		expect(isRateLimited(ip)).toBe(false);
	});

	it('still counts a request made partway through the window', () => {
		const ip = freshIp();
		for (let i = 0; i < 5; i++) isRateLimited(ip);

		// Half the window later, the earlier five are still in scope.
		vi.advanceTimersByTime(30_000);
		for (let i = 0; i < 5; i++) isRateLimited(ip);
		expect(isRateLimited(ip)).toBe(true);

		// Past the original five expiring, but the later five remain.
		vi.advanceTimersByTime(30_001);
		expect(isRateLimited(ip)).toBe(false);
	});
});
