import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Contextual key/value pairs attached to a log entry. `undefined` values are
 *  dropped, so callers can pass optional fields without guarding each one. */
export type LogFields = Record<string, string | number | boolean | undefined>;

// Ordered low-to-high — lines below the active level are skipped.
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

// `MAGI_LOG_LEVEL` overrides the default. Default leans on env: dev wants
// the lot; prod wants info+ unless the operator opts into debug. An invalid
// value silently falls back to the default rather than crashing the server.
// Read per-call so a deployment can flip the level without a process restart,
// and so tests can mutate `process.env.MAGI_LOG_LEVEL` between cases.
function activeLevel(): LogLevel {
	const raw = env.MAGI_LOG_LEVEL?.toLowerCase().trim();
	if (raw && raw in LEVEL_ORDER) return raw as LogLevel;
	return dev ? 'debug' : 'info';
}

/** Emit one structured log entry. In dev it renders as a compact, readable
 *  line (`event key=value …`); in production it's a single JSON object per
 *  line so a log collector can parse and index every field. Levels below the
 *  active threshold (`MAGI_LOG_LEVEL`) are dropped before sink dispatch. */
export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
	if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel()]) return;
	const defined = Object.entries(fields).filter(([, v]) => v !== undefined);
	const sink =
		level === 'error'
			? console.error
			: level === 'warn'
				? console.warn
				: level === 'debug'
					? console.debug
					: console.log;

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
