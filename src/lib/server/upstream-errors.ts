/** Classify an error message to decide whether to poison the health cache.
 *  Only availability-shaped failures (HTTP 404/410/5xx, "No endpoints found",
 *  model-not-found variants) should mark a model unhealthy — context-window
 *  overflows, auth rejections, and rate-limits are per-request conditions that
 *  don't indicate the model itself is down, so caching them blocks retries for
 *  2 min on every turn for no gain. */
export function isAvailabilityError(message: string): boolean {
	const lower = message.toLowerCase();
	// The exclusions are the whole test: per-request failures must never poison
	// the cache, and their messages routinely contain 3-digit numbers ("maximum
	// context length is 512 tokens", "limit of 500 requests per day") that look
	// like status codes. Everything else — "no endpoints found", "model not
	// found", 404/410/5xx text, and unknown errors — counts as availability, so
	// genuinely broken models are still cached (avoids hammering a down endpoint).
	return !(
		lower.includes('context') ||
		lower.includes('token') ||
		// An empty response is a per-request fluke, not a down endpoint — a model
		// that returns nothing once usually answers fine on the next turn, so never
		// poison its health for it.
		lower.includes('empty response') ||
		/\b(401|403|429)\b/.test(message) ||
		lower.includes('unauthorized') ||
		lower.includes('forbidden') ||
		lower.includes('rate limit') ||
		lower.includes('rate_limit')
	);
}

/** True when an error is an auth/config rejection (a 401/403 — missing, invalid,
 *  or expired API key) rather than model flakiness. Walks the raw error tree
 *  (status code + body + nested cause/lastError) because streamText hands the
 *  caller a generic NoOutputGeneratedError while the real 401 only carries a
 *  status code on the underlying APICallError. Used so an all-nodes-failed turn
 *  caused by a dead key reads as a server config problem, not "models failed".
 *  Takes the raw error object (not a message) so the status code is available. */
export function isAuthError(err: unknown, depth = 0, seen = new Set<unknown>()): boolean {
	if (!err || typeof err !== 'object' || depth > 5 || seen.has(err)) return false;
	seen.add(err);
	const e = err as {
		statusCode?: number;
		responseBody?: string;
		message?: string;
		cause?: unknown;
		lastError?: unknown;
	};
	if (e.statusCode === 401 || e.statusCode === 403) return true;
	const text = `${e.responseBody ?? ''} ${e.message ?? ''}`.toLowerCase();
	if (
		/\b(401|403)\b/.test(text) ||
		text.includes('unauthorized') ||
		text.includes('forbidden') ||
		text.includes('user not found') ||
		text.includes('invalid api key') ||
		text.includes('no auth credentials') ||
		text.includes('authentication')
	)
		return true;
	return isAuthError(e.cause, depth + 1, seen) || isAuthError(e.lastError, depth + 1, seen);
}

/** The human-readable reason inside an upstream error: unwraps the AI SDK's
 *  `responseBody` (OpenRouter's `metadata.raw`, then `error.message`) and a
 *  RetryError's `lastError`. */
export function extractErrorMessage(err: unknown): string {
	if (err && typeof err === 'object') {
		// AI SDK wraps upstream errors — dig into responseBody for the real message
		const apiErr = err as { responseBody?: string };
		if (apiErr.responseBody) {
			try {
				const body = JSON.parse(apiErr.responseBody);
				const raw = body?.error?.metadata?.raw;
				if (raw) {
					try {
						return JSON.parse(raw).error ?? raw;
					} catch {
						return raw;
					}
				}
				if (body?.error?.message) return body.error.message;
			} catch {
				// fall through
			}
		}
		// RetryError — dig into the last error
		const retryErr = err as { lastError?: unknown };
		if (retryErr.lastError) return extractErrorMessage(retryErr.lastError);
	}
	if (err instanceof Error) return err.message;
	return 'Unknown error';
}
