/** Redact a raw upstream error before it leaves the server in an SSE event. The
 *  full message is still logged server-side; this only governs what the browser
 *  sees. Strips leak vectors (request URLs, bearer tokens / `sk-…` keys,
 *  absolute file paths, IP:port pairs) and caps length, while preserving the
 *  human-readable reason the UI relies on (rate-limit and context-window hints).
 *  Lives outside the route because consensus strategies relay errors too. */
export function scrubErrorMessage(message: string): string {
	const scrubbed = message
		// API keys / bearer tokens — long opaque secrets that must never surface.
		.replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}/g, '[redacted-key]')
		// Google AI Studio keys (AIza…) — a BYOK gateway, so a key could surface in
		// an upstream error body; the sk-/rk-/pk- rule above doesn't cover them.
		.replace(/\bAIza[0-9A-Za-z_-]{10,}/g, '[redacted-key]')
		.replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
		// URLs — provider endpoints can carry keys in query strings or path.
		.replace(/https?:\/\/\S+/gi, '[url]')
		// Absolute filesystem paths — internal server layout.
		.replace(/(?:\/[\w.-]+){2,}/g, '[path]')
		// IP:port — internal hosts.
		.replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '[host]')
		.replace(/\s+/g, ' ')
		.trim();
	if (!scrubbed) return 'The model failed to respond.';
	const MAX = 300;
	return scrubbed.length > MAX ? `${scrubbed.slice(0, MAX - 1).trimEnd()}…` : scrubbed;
}
