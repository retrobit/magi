import { describe, it, expect, beforeEach } from 'vitest';
import { markUnhealthy, getHealthStatus, isModelHealthy, _testing } from './health';

const { healthCache } = _testing;

beforeEach(() => {
	healthCache.clear();
});

describe('markUnhealthy', () => {
	it('marks a model as unhealthy with a reason', () => {
		markUnhealthy('test-model', 'connection refused');
		const entry = getHealthStatus('test-model');
		expect(entry).toBeDefined();
		expect(entry!.status).toBe('unhealthy');
		expect(entry!.lastError).toBe('connection refused');
	});

	it('overwrites previous health status', () => {
		healthCache.set('test-model', { status: 'healthy', lastChecked: Date.now() });
		markUnhealthy('test-model', 'timeout');
		expect(getHealthStatus('test-model')!.status).toBe('unhealthy');
	});
});

describe('getHealthStatus', () => {
	it('returns undefined for unknown models', () => {
		expect(getHealthStatus('never-seen')).toBeUndefined();
	});

	it('returns cached entry', () => {
		healthCache.set('cached-model', { status: 'healthy', lastChecked: Date.now() });
		const entry = getHealthStatus('cached-model');
		expect(entry!.status).toBe('healthy');
	});

	it('clears expired unhealthy entries', () => {
		healthCache.set('expired-model', {
			status: 'unhealthy',
			lastChecked: Date.now() - 5 * 60_000,
			lastError: 'old failure'
		});
		expect(getHealthStatus('expired-model')).toBeUndefined();
	});
});

describe('isModelHealthy', () => {
	it('returns true for unknown models', () => {
		expect(isModelHealthy('unknown-model')).toBe(true);
	});

	it('returns false for unhealthy models', () => {
		markUnhealthy('bad-model', 'failure');
		expect(isModelHealthy('bad-model')).toBe(false);
	});

	it('returns true after unhealthy TTL expires', () => {
		healthCache.set('recovering-model', {
			status: 'unhealthy',
			lastChecked: Date.now() - 5 * 60_000,
			lastError: 'old failure'
		});
		expect(isModelHealthy('recovering-model')).toBe(true);
	});
});
