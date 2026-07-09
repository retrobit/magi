import { describe, it, expect } from 'vitest';
import { encodeStreamEvent, decodeStreamEvents } from './stream-events';

// Feed a set of string chunks through a ReadableStream so decodeStreamEvents
// sees exactly the byte boundaries we choose (to exercise split frames).
function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
	const enc = new TextEncoder();
	return new ReadableStream({
		start(c) {
			for (const chunk of chunks) c.enqueue(enc.encode(chunk));
			c.close();
		}
	});
}

async function collect(stream: ReadableStream<Uint8Array>) {
	const out: { event: string; data: unknown }[] = [];
	for await (const e of decodeStreamEvents(stream)) out.push(e);
	return out;
}

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

describe('decodeStreamEvents', () => {
	it('round-trips whatever encodeStreamEvent produced', async () => {
		const stream = streamOf(
			encodeStreamEvent('consensus-chunk', { text: 'hi' }) +
				encodeStreamEvent('partial-consensus', { responded: 2, total: 3 })
		);
		expect(await collect(stream)).toEqual([
			{ event: 'consensus-chunk', data: { text: 'hi' } },
			{ event: 'partial-consensus', data: { responded: 2, total: 3 } }
		]);
	});

	it('reassembles a frame split across chunk boundaries', async () => {
		const frame = encodeStreamEvent('model-chunk', { node: 'MAGI_1', text: 'x' });
		const mid = Math.floor(frame.length / 2);
		expect(await collect(streamOf(frame.slice(0, mid), frame.slice(mid)))).toEqual([
			{ event: 'model-chunk', data: { node: 'MAGI_1', text: 'x' } }
		]);
	});

	it('skips a frame with unparseable JSON but keeps the following ones', async () => {
		const good = encodeStreamEvent('error', { message: 'ok' });
		expect(await collect(streamOf(`event: error\ndata: {bad\n\n${good}`))).toEqual([
			{ event: 'error', data: { message: 'ok' } }
		]);
	});

	it('does not emit a trailing partial frame that never terminated', async () => {
		expect(await collect(streamOf('event: error\ndata: {"message":"x"}'))).toEqual([]);
	});
});
