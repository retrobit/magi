import { dev } from '$app/environment';

export type LogLevel = 'info' | 'warn' | 'error';

/** Contextual key/value pairs attached to a log entry. `undefined` values are
 *  dropped, so callers can pass optional fields without guarding each one. */
export type LogFields = Record<string, string | number | boolean | undefined>;

/** Emit one structured log entry. In dev it renders as a compact, readable
 *  line (`event key=value …`); in production it's a single JSON object per
 *  line so a log collector can parse and index every field. */
export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
	const defined = Object.entries(fields).filter(([, v]) => v !== undefined);
	const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

	if (dev) {
		const ts = new Date().toISOString().slice(11, 23);
		const detail = defined.map(([k, v]) => `${k}=${v}`).join(' ');
		sink(`[MAGI ${ts}] ${event}${detail ? ` ${detail}` : ''}`);
	} else {
		sink(
			JSON.stringify({ ts: new Date().toISOString(), level, event, ...Object.fromEntries(defined) })
		);
	}
}

/** Start a stopwatch. The returned function reports whole milliseconds elapsed
 *  since this call — the unit for the per-model latency metrics. */
export function startTimer(): () => number {
	const start = performance.now();
	return () => Math.round(performance.now() - start);
}
