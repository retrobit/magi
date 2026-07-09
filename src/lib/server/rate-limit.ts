import { env } from '$env/dynamic/private';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logEvent } from './logger';

// Keep the two window forms in sync: WINDOW_MS drives the in-memory fallback,
// the '60 s' literal drives the Upstash sliding window.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
// BYOK callers pay for their own tokens, so the limiter only guards our
// serverless compute — a much larger bucket is safe.
const KEYED_MAX_REQUESTS = 30;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

export interface RateLimitResult {
	/** Whether this request should be rejected with a 429. */
	limited: boolean;
	/** Seconds until the client may retry — 0 when not limited. Feeds Retry-After. */
	retryAfterSeconds: number;
}

// ---- Durable limiter (Upstash Redis, when configured) ----------------------

// `undefined` = not yet resolved; `null` = resolved to "no durable store".
// Standard and keyed (BYOK) traffic get separate limiters — different caps,
// different Redis prefixes — so a caller can't stretch one bucket with the other.
let redisLimiters: { standard: Ratelimit; keyed: Ratelimit } | null | undefined;

function getRedisLimiter(keyed: boolean): Ratelimit | null {
	if (redisLimiters !== undefined) {
		return redisLimiters === null ? null : redisLimiters[keyed ? 'keyed' : 'standard'];
	}
	// Vercel's Upstash integration injects the KV_REST_API_* names (the Vercel-KV
	// flavor), NOT the UPSTASH_REDIS_REST_* ones the standalone SDK docs show.
	const url = env.KV_REST_API_URL;
	const token = env.KV_REST_API_TOKEN;
	if (!url || !token) {
		redisLimiters = null;
		return null;
	}
	const redis = new Redis({ url, token });
	redisLimiters = {
		standard: new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(MAX_REQUESTS, '60 s'),
			// Fail open fast: without this, a degraded Upstash makes limit() hang up
			// to the SDK's default before resolving, adding that latency to EVERY
			// request. 1s cap → a slow store degrades to best-effort, as intended.
			timeout: 1000,
			prefix: 'magi:rl'
		}),
		keyed: new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(KEYED_MAX_REQUESTS, '60 s'),
			timeout: 1000,
			prefix: 'magi:rlk'
		})
	};
	return redisLimiters[keyed ? 'keyed' : 'standard'];
}

// ---- In-memory limiter (fallback: local dev, or an unconfigured deploy) -----

const requests = new Map<string, number[]>();

function checkInMemory(ip: string, keyed: boolean): RateLimitResult {
	// Bucket key mirrors the Redis prefix split: keyed traffic counts separately.
	const bucket = keyed ? `k:${ip}` : ip;
	const max = keyed ? KEYED_MAX_REQUESTS : MAX_REQUESTS;
	const now = Date.now();
	const timestamps = (requests.get(bucket) ?? []).filter((t) => now - t < WINDOW_MS);
	if (timestamps.length >= max) {
		requests.set(bucket, timestamps);
		// The oldest timestamp exits the window first — once it's gone the count
		// drops below the limit and the next request is allowed.
		const oldest = timestamps[0];
		return {
			limited: true,
			retryAfterSeconds: Math.max(0, Math.ceil((oldest + WINDOW_MS - now) / 1000))
		};
	}
	timestamps.push(now);
	requests.set(bucket, timestamps);
	return { limited: false, retryAfterSeconds: 0 };
}

// ---- Public API -------------------------------------------------------------

/** Sliding-window per-IP rate limit — 10 requests / 60s, or 30 for callers whose
 *  request carries their own BYOK provider keys (`keyed`: their token spend, our
 *  compute). Uses the durable Upstash store across the serverless fleet when
 *  configured (KV_REST_API_URL + KV_REST_API_TOKEN); otherwise — including if
 *  Redis is momentarily unreachable — falls back to a per-instance in-memory
 *  limiter, so a limiter outage degrades to best-effort rather than blocking
 *  every caller or failing fully open. */
export async function checkRateLimit(
	ip: string,
	opts: { keyed?: boolean } = {}
): Promise<RateLimitResult> {
	const keyed = opts.keyed ?? false;
	const limiter = getRedisLimiter(keyed);
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
			return checkInMemory(ip, keyed);
		}
	}
	return checkInMemory(ip, keyed);
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
