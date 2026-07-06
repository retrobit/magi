import { env } from '$env/dynamic/private';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logEvent } from './logger';

// Keep the two window forms in sync: WINDOW_MS drives the in-memory fallback,
// the '60 s' literal drives the Upstash sliding window.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

export interface RateLimitResult {
	/** Whether this request should be rejected with a 429. */
	limited: boolean;
	/** Seconds until the client may retry — 0 when not limited. Feeds Retry-After. */
	retryAfterSeconds: number;
}

// ---- Durable limiter (Upstash Redis, when configured) ----------------------

// `undefined` = not yet resolved; `null` = resolved to "no durable store".
let redisLimiter: Ratelimit | null | undefined;

function getRedisLimiter(): Ratelimit | null {
	if (redisLimiter !== undefined) return redisLimiter;
	// Vercel's Upstash integration injects the KV_REST_API_* names (the Vercel-KV
	// flavor), NOT the UPSTASH_REDIS_REST_* ones the standalone SDK docs show.
	const url = env.KV_REST_API_URL;
	const token = env.KV_REST_API_TOKEN;
	if (!url || !token) {
		redisLimiter = null;
		return null;
	}
	redisLimiter = new Ratelimit({
		redis: new Redis({ url, token }),
		limiter: Ratelimit.slidingWindow(MAX_REQUESTS, '60 s'),
		prefix: 'magi:rl'
	});
	return redisLimiter;
}

// ---- In-memory limiter (fallback: local dev, or an unconfigured deploy) -----

const requests = new Map<string, number[]>();

function checkInMemory(ip: string): RateLimitResult {
	const now = Date.now();
	const timestamps = (requests.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
	if (timestamps.length >= MAX_REQUESTS) {
		requests.set(ip, timestamps);
		// The oldest timestamp exits the window first — once it's gone the count
		// drops below the limit and the next request is allowed.
		const oldest = timestamps[0];
		return {
			limited: true,
			retryAfterSeconds: Math.max(0, Math.ceil((oldest + WINDOW_MS - now) / 1000))
		};
	}
	timestamps.push(now);
	requests.set(ip, timestamps);
	return { limited: false, retryAfterSeconds: 0 };
}

// ---- Public API -------------------------------------------------------------

/** Sliding-window per-IP rate limit (10 requests / 60s). Uses the durable Upstash
 *  store across the serverless fleet when configured (KV_REST_API_URL +
 *  KV_REST_API_TOKEN); otherwise — including if Redis is momentarily unreachable —
 *  falls back to a per-instance in-memory limiter, so a limiter outage degrades to
 *  best-effort rather than blocking every caller or failing fully open. */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
	const limiter = getRedisLimiter();
	if (limiter) {
		try {
			const { success, reset } = await limiter.limit(ip);
			return {
				limited: !success,
				retryAfterSeconds: success ? 0 : Math.max(0, Math.ceil((reset - Date.now()) / 1000))
			};
		} catch (err) {
			logEvent('warn', 'ratelimit.redis_unreachable', {
				error: err instanceof Error ? err.message : String(err)
			});
			return checkInMemory(ip);
		}
	}
	return checkInMemory(ip);
}

// Periodically sweep stale in-memory entries to prevent unbounded growth. Costs
// nothing when the durable limiter is active — the map simply stays empty.
setInterval(() => {
	const now = Date.now();
	for (const [ip, timestamps] of requests) {
		const active = timestamps.filter((t) => now - t < WINDOW_MS);
		if (active.length === 0) requests.delete(ip);
		else requests.set(ip, active);
	}
}, CLEANUP_INTERVAL_MS).unref();
