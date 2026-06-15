import { describe, it, expect } from 'vitest';
import { encodeStreamEvent } from './stream-events';

describe('encodeStreamEvent', () => {
	it('emits an SSE frame: an event line, a data line, and a blank-line terminator', () => {
		const frame = encodeStreamEvent('consensus-chunk', { text: 'hello' });
		expect(frame).toBe('event: consensus-chunk\ndata: {"text":"hello"}\n\n');
	});

	it('JSON-encodes the payload so the receiver can round-trip it', () => {
		const payload = { node: 'MAGI_1', text: 'line one\nline two' } as const;
		const frame = encodeStreamEvent('model-chunk', payload);
		const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
		expect(dataLine).toBeDefined();
		expect(JSON.parse(dataLine!.slice(6))).toEqual(payload);
	});

	it('terminates every frame with a blank line so the SSE parser flushes it', () => {
		expect(encodeStreamEvent('error', { message: 'boom' }).endsWith('\n\n')).toBe(true);
	});

	it('names the event on its own line', () => {
		const frame = encodeStreamEvent('partial-consensus', { responded: 2, total: 3 });
		expect(frame.startsWith('event: partial-consensus\n')).toBe(true);
	});
});
