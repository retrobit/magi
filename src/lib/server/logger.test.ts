import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from '$env/dynamic/private';
import { logEvent, startTimer } from './logger';

describe('logEvent', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		delete env.MAGI_LOG_LEVEL;
	});

	it('emits a line carrying the event name and every field', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		logEvent('info', 'node.complete', { node: 'MAGI_1', totalMs: 1234 });
		expect(spy).toHaveBeenCalledOnce();
		// Format-agnostic — holds for both the dev (key=value) and prod (JSON) sink.
		const line = spy.mock.calls[0].join(' ');
		expect(line).toContain('node.complete');
		expect(line).toContain('MAGI_1');
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

	it('routes debug to console.debug', () => {
		const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
		logEvent('debug', 'phase1.dispatch.detail', { node: 'MAGI_3' });
		expect(debugSpy).toHaveBeenCalledOnce();
	});

	it('drops lines below the MAGI_LOG_LEVEL threshold', () => {
		env.MAGI_LOG_LEVEL = 'warn';
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		logEvent('debug', 'noisy');
		logEvent('info', 'chatty');
		logEvent('warn', 'real_issue');
		logEvent('error', 'broken');
		expect(debugSpy).not.toHaveBeenCalled();
		expect(logSpy).not.toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalledOnce();
		expect(errorSpy).toHaveBeenCalledOnce();
	});

	it('falls back to the default level when MAGI_LOG_LEVEL is garbage', () => {
		env.MAGI_LOG_LEVEL = 'verbose-please';
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		// Default in test env is `debug` (dev=true), so info passes through.
		logEvent('info', 'request');
		expect(logSpy).toHaveBeenCalledOnce();
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
