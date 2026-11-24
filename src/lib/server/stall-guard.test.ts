import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStallGuard } from './stall-guard';

describe('createStallGuard', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('aborts after the idle window when reset is not called', () => {
		const parent = new AbortController();
		const guard = createStallGuard(parent.signal, 1000);
		expect(guard.signal.aborted).toBe(false);
		vi.advanceTimersByTime(1000);
		expect(guard.signal.aborted).toBe(true);
		expect(guard.timedOut()).toBe(true);
	});

	it('stays open while reset keeps being called before the window elapses', () => {
		const parent = new AbortController();
		const guard = createStallGuard(parent.signal, 1000);
		vi.advanceTimersByTime(700);
		guard.reset();
		vi.advanceTimersByTime(700);
		guard.reset();
		vi.advanceTimersByTime(700);
		expect(guard.signal.aborted).toBe(false);
		guard.cleanup();
	});

	it('propagates a later client abort and does NOT flag it as a stall', () => {
		const parent = new AbortController();
		const guard = createStallGuard(parent.signal, 10_000);
		parent.abort();
		expect(guard.signal.aborted).toBe(true);
		expect(guard.timedOut()).toBe(false);
		guard.cleanup();
	});

	it('is already aborted when the parent aborted first', () => {
		const parent = new AbortController();
		parent.abort();
		const guard = createStallGuard(parent.signal, 1000);
		expect(guard.signal.aborted).toBe(true);
		expect(guard.timedOut()).toBe(false);
	});

	it('starts with the first window, then uses the idle window or the one passed to reset', () => {
		const parent = new AbortController();
		const guard = createStallGuard(parent.signal, 1000, 5000);
		vi.advanceTimersByTime(4000);
		expect(guard.signal.aborted).toBe(false); // still inside the first window
		guard.reset(5000); // visible thinking re-arms the long window
		vi.advanceTimersByTime(4000);
		expect(guard.signal.aborted).toBe(false);
		guard.reset(); // answering: the short idle window
		vi.advanceTimersByTime(1000);
		expect(guard.signal.aborted).toBe(true);
		expect(guard.stalledAfterMs()).toBe(1000);
	});

	it('reports the first window as the stall length when nothing ever arrived', () => {
		const guard = createStallGuard(new AbortController().signal, 1000, 5000);
		vi.advanceTimersByTime(5000);
		expect(guard.stalledAfterMs()).toBe(5000);
	});

	it('cleanup() stops the timer from firing', () => {
		const parent = new AbortController();
		const guard = createStallGuard(parent.signal, 1000);
		guard.cleanup();
		vi.advanceTimersByTime(2000);
		expect(guard.signal.aborted).toBe(false);
	});
});
