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

/** Seconds until the oldest in-window request ages out, giving the client a
 *  minimum wait before any new request would be allowed. Returns 0 when the
 *  IP is not currently limited (callers should check isRateLimited first). */
export function retryAfterSeconds(ip: string): number {
	const now = Date.now();
	const timestamps = (requests.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
	if (timestamps.length < MAX_REQUESTS) return 0;
	// The oldest timestamp exits the window first — once it's gone, the count
	// drops below MAX_REQUESTS and the next request goes through.
	const oldest = timestamps[0];
	return Math.max(0, Math.ceil((oldest + WINDOW_MS - now) / 1000));
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
