export interface ModelHealthEntry {
	status: 'healthy' | 'unhealthy' | 'unknown';
	lastChecked: number;
	lastError?: string;
}

const healthCache = new Map<string, ModelHealthEntry>();

const UNHEALTHY_TTL = 2 * 60_000;
const CLEANUP_INTERVAL = 15 * 60_000;

export function markUnhealthy(modelId: string, reason: string): void {
	healthCache.set(modelId, {
		status: 'unhealthy',
		lastChecked: Date.now(),
		lastError: reason
	});
}

export function getHealthStatus(modelId: string): ModelHealthEntry | undefined {
	const entry = healthCache.get(modelId);
	if (!entry) return undefined;
	if (entry.status === 'unhealthy' && Date.now() - entry.lastChecked > UNHEALTHY_TTL) {
		healthCache.delete(modelId);
		return undefined;
	}
	return entry;
}

export function isModelHealthy(modelId: string): boolean {
	const entry = getHealthStatus(modelId);
	return !entry || entry.status !== 'unhealthy';
}

setInterval(() => {
	const now = Date.now();
	for (const [id, entry] of healthCache) {
		if (now - entry.lastChecked > UNHEALTHY_TTL * 2) {
			healthCache.delete(id);
		}
	}
}, CLEANUP_INTERVAL).unref();

export const _testing = { healthCache };
