const requests = new Map<string, number[]>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

export function isRateLimited(ip: string): boolean {
	const now = Date.now();
	const timestamps = (requests.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

	if (timestamps.length >= MAX_REQUESTS) {
		requests.set(ip, timestamps);
		return true;
	}

	timestamps.push(now);
	requests.set(ip, timestamps);
	return false;
}

// Periodically sweep stale entries to prevent unbounded memory growth
setInterval(() => {
	const now = Date.now();
	for (const [ip, timestamps] of requests) {
		const active = timestamps.filter((t) => now - t < WINDOW_MS);
		if (active.length === 0) {
			requests.delete(ip);
		} else {
			requests.set(ip, active);
		}
	}
}, CLEANUP_INTERVAL_MS).unref();
