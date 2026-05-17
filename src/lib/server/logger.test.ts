import { describe, it, expect, vi, afterEach } from 'vitest';
import { logEvent, startTimer } from './logger';

describe('logEvent', () => {
	afterEach(() => vi.restoreAllMocks());

	it('emits a line carrying the event name and every field', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		logEvent('info', 'node.complete', { node: 'MELCHIOR', totalMs: 1234 });
		expect(spy).toHaveBeenCalledOnce();
		// Format-agnostic — holds for both the dev (key=value) and prod (JSON) sink.
		const line = spy.mock.calls[0].join(' ');
		expect(line).toContain('node.complete');
		expect(line).toContain('MELCHIOR');
		expect(line).toContain('1234');
	});

	it('drops undefined fields', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		logEvent('info', 'request', { tier: 'free', missing: undefined });
		const line = spy.mock.calls[0].join(' ');
		expect(line).toContain('free');
		expect(line).not.toContain('missing');
	});

	it('routes errors to console.error and warnings to console.warn', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		logEvent('error', 'request.failed', { error: 'boom' });
		logEvent('warn', 'node.unhealthy');
		expect(errorSpy).toHaveBeenCalledOnce();
		expect(warnSpy).toHaveBeenCalledOnce();
	});
});

describe('startTimer', () => {
	it('reports non-negative whole milliseconds elapsed', () => {
		const elapsed = startTimer();
		const ms = elapsed();
		expect(ms).toBeGreaterThanOrEqual(0);
		expect(Number.isInteger(ms)).toBe(true);
	});
});
