import type {
	DebateRoundEntry,
	DebateVerdict,
	GatewayName,
	MagiNodeName,
	MagiResponse
} from './types';
import type { MagiConfig } from './config';
import type { RunStats } from './consensus/types';

/** Payload shape for every server-sent event on the `/api/magi` SSE stream.
 *  The server's `send()` and the client's event handlers are both typed
 *  against this map, so a renamed event or a changed payload fails to
 *  compile on both ends instead of breaking silently at runtime. */
export interface StreamEventPayloads {
	config: MagiConfig;
	'model-chunk': { node: MagiNodeName; text: string };
	'model-response': MagiResponse;
	'model-error': { node: MagiNodeName; gateway: GatewayName; provider: string; error: string };
	'model-usage': {
		node: MagiNodeName;
		inputTokens: number;
		outputTokens: number;
		cachedInputTokens: number;
	};
	'partial-consensus': { responded: number; total: number };
	/** The node whose seat the server ACTUALLY used for synthesis. Usually the
	 *  requested consensus node, but the server reseats onto the first responding
	 *  node when the chosen seat failed phase 1 — so the client reads the seat from
	 *  here (not the original request) to label the synthesizer and size its context
	 *  gauge against the right model. */
	'consensus-seat': { node: MagiNodeName };
	'consensus-chunk': { text: string };
	'consensus-complete': { text: string; debateVerdict?: DebateVerdict; debateSummary?: string };
	'consensus-usage': { inputTokens: number; outputTokens: number; cachedInputTokens: number };
	/** Per-run stats for the stats panel — usage axes for every run, plus the
	 *  rich voting metrics when the run used Structured Voting. */
	'run-stats': RunStats;
	/** A debater's revised answer for one round — routed into that node's panel. */
	'node-round': { node: MagiNodeName; entry: DebateRoundEntry };
	error: { message: string };
}

export type StreamEventName = keyof StreamEventPayloads;

/** Encode one event as an SSE frame: an `event:` line, a `data:` line, and
 *  the blank-line terminator. Keeps the wire format in a single place. */
export function encodeStreamEvent<E extends StreamEventName>(
	event: E,
	data: StreamEventPayloads[E]
): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
