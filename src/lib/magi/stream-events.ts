import type { GatewayName, MagiNodeName, MagiResponse } from './types';
import type { MagiConfig } from './config';
import type { VotingStats } from './consensus/types';

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
	'consensus-chunk': { text: string };
	'consensus-complete': { text: string };
	'consensus-usage': { inputTokens: number; outputTokens: number; cachedInputTokens: number };
	/** Structured stats from a strategy that has them (currently voting only). */
	'vote-stats': VotingStats;
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
