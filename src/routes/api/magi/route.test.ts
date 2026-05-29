import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamText } from 'ai';
import { env as _env } from '$env/dynamic/private';
import { isRateLimited } from '$lib/server/rate-limit';
import { isModelHealthy, markUnhealthy } from '$lib/server/health';
import { POST, _extractErrorMessage } from './+server';

interface MutableEnv {
	MAGI_API_KEY?: string;
}

const env = _env as unknown as MutableEnv;

vi.mock('ai', () => ({ streamText: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({ env: {} as MutableEnv }));
vi.mock('$lib/server/rate-limit', () => ({ isRateLimited: vi.fn(() => false) }));
vi.mock('$lib/server/health', () => ({
	markUnhealthy: vi.fn(),
	isModelHealthy: vi.fn(() => true),
	getHealthStatus: vi.fn(() => undefined)
}));
vi.mock('$lib/magi/models', () => ({ getModel: vi.fn(() => ({})) }));
vi.mock('$lib/server/openrouter', () => ({ getOpenRouterFreeModels: vi.fn(async () => []) }));
vi.mock('$lib/server/logger', () => ({
	logEvent: vi.fn(),
	startTimer: vi.fn(() => () => 0)
}));

const streamTextMock = vi.mocked(streamText);

function fakeStream(text: string) {
	return {
		textStream: (async function* () {
			yield text;
		})(),
		usage: Promise.resolve({ inputTokens: 5, outputTokens: 3, cachedInputTokens: 1 })
	};
}

const validBody = { query: 'Hello MAGI', tier: 'balanced', strategy: 'synthesis' };

type PostEvent = Parameters<typeof POST>[0];

function callPost(body: unknown, init: { headers?: Record<string, string>; raw?: string } = {}) {
	const request = new Request('http://localhost/api/magi', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...init.headers },
		body: init.raw ?? JSON.stringify(body)
	});
	return POST({ request, getClientAddress: () => '127.0.0.1' } as unknown as PostEvent);
}

interface StreamEvent {
	event: string;
	data: unknown;
}

async function readEvents(res: Response): Promise<StreamEvent[]> {
	const events: StreamEvent[] = [];
	const reader = res.body!.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const parts = buffer.split('\n\n');
		buffer = parts.pop() ?? '';
		for (const part of parts) {
			let event = '';
			let data = '';
			for (const line of part.split('\n')) {
				if (line.startsWith('event: ')) event = line.slice(7);
				else if (line.startsWith('data: ')) data = line.slice(6);
			}
			if (event) events.push({ event, data: data ? JSON.parse(data) : null });
		}
	}
	return events;
}

const names = (events: StreamEvent[]) => events.map((e) => e.event);
const firstIndex = (events: StreamEvent[], name: string) => names(events).indexOf(name);
const lastIndex = (events: StreamEvent[], name: string) => names(events).lastIndexOf(name);

beforeEach(() => {
	streamTextMock.mockReset();
	streamTextMock.mockImplementation(() => fakeStream('chunk') as never);
	vi.mocked(isRateLimited).mockReturnValue(false);
	vi.mocked(isModelHealthy).mockReturnValue(true);
});

afterEach(() => {
	delete env.MAGI_API_KEY;
});

describe('POST /api/magi — request guards', () => {
	it('rejects a non-JSON content type with 415', async () => {
		const res = await callPost(validBody, { headers: { 'content-type': 'text/plain' } });
		expect(res.status).toBe(415);
	});

	it('rejects a malformed JSON body with 400', async () => {
		const res = await callPost(undefined, { raw: '{not valid json' });
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe('Invalid JSON');
	});

	it('rejects a schema-invalid request with 400', async () => {
		const res = await callPost({ query: '', tier: 'balanced', strategy: 'synthesis' });
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe('Invalid request');
	});

	it('returns 429 when the client is rate limited', async () => {
		vi.mocked(isRateLimited).mockReturnValue(true);
		const res = await callPost(validBody);
		expect(res.status).toBe(429);
	});
});

describe('POST /api/magi — API key auth', () => {
	it('rejects a request with no token when MAGI_API_KEY is set', async () => {
		env.MAGI_API_KEY = 'secret';
		const res = await callPost(validBody);
		expect(res.status).toBe(401);
	});

	it('rejects a request bearing the wrong token', async () => {
		env.MAGI_API_KEY = 'secret';
		const res = await callPost(validBody, { headers: { authorization: 'Bearer wrong' } });
		expect(res.status).toBe(401);
	});

	it('admits a request bearing the correct token', async () => {
		env.MAGI_API_KEY = 'secret';
		const res = await callPost(validBody, { headers: { authorization: 'Bearer secret' } });
		expect(res.headers.get('content-type')).toBe('text/event-stream');
	});
});

describe('POST /api/magi — streaming', () => {
	it('streams config, three node responses, and the consensus for a valid request', async () => {
		const res = await callPost(validBody);
		expect(res.headers.get('content-type')).toBe('text/event-stream');
		const events = await readEvents(res);
		const got = names(events);
		expect(got).toContain('config');
		expect(got.filter((n) => n === 'model-response')).toHaveLength(3);
		expect(got.filter((n) => n === 'model-usage')).toHaveLength(3);
		expect(got).toContain('consensus-chunk');
		expect(got).toContain('consensus-complete');
		expect(got).toContain('consensus-usage');
		expect(got).not.toContain('partial-consensus');
	});

	it('emits events in the contract order: config → phase-1 → consensus', async () => {
		const events = await readEvents(await callPost(validBody));
		// config opens the stream, before any node output.
		expect(firstIndex(events, 'config')).toBe(0);
		expect(firstIndex(events, 'config')).toBeLessThan(firstIndex(events, 'model-response'));
		// All phase-1 node responses land before consensus synthesis begins.
		expect(lastIndex(events, 'model-response')).toBeLessThan(firstIndex(events, 'consensus-chunk'));
		// The consensus answer streams, then completes, then reports usage.
		expect(firstIndex(events, 'consensus-chunk')).toBeLessThan(
			firstIndex(events, 'consensus-complete')
		);
		expect(firstIndex(events, 'consensus-complete')).toBeLessThan(
			firstIndex(events, 'consensus-usage')
		);
	});

	it('emits a model-error and a partial-consensus when one node fails', async () => {
		streamTextMock.mockImplementationOnce(() => {
			throw new Error('model boom');
		});
		const events = await readEvents(await callPost(validBody));
		const got = names(events);
		expect(got.filter((n) => n === 'model-response')).toHaveLength(2);
		expect(got).toContain('model-error');
		const partial = events.find((e) => e.event === 'partial-consensus');
		expect(partial?.data).toEqual({ responded: 2, total: 3 });
		expect(got).toContain('consensus-complete');
	});

	it('emits a fatal error event when every model is unhealthy', async () => {
		vi.mocked(isModelHealthy).mockReturnValue(false);
		const events = await readEvents(await callPost(validBody));
		expect(names(events).filter((n) => n === 'model-error')).toHaveLength(3);
		const fatal = events.find((e) => e.event === 'error');
		expect(fatal?.data).toEqual({ message: 'All three models are unavailable' });
		expect(names(events)).not.toContain('consensus-complete');
	});

	it('does not emit model-error or poison health when the client aborts', async () => {
		vi.mocked(markUnhealthy).mockClear();
		// The first node call aborts the request (synchronously firing the abort
		// listener wired in the handler), then throws — so by the time the catch
		// runs, signal.aborted is true and the failure must be treated as a
		// teardown, not a model fault.
		const clientAbort = new AbortController();
		streamTextMock.mockImplementation(() => {
			clientAbort.abort();
			throw new Error('aborted by client');
		});
		const request = new Request('http://localhost/api/magi', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(validBody),
			signal: clientAbort.signal
		});
		const res = await POST({
			request,
			getClientAddress: () => '127.0.0.1'
		} as unknown as PostEvent);
		const events = await readEvents(res);
		expect(names(events)).not.toContain('model-error');
		expect(vi.mocked(markUnhealthy)).not.toHaveBeenCalled();
	});
});

describe('_extractErrorMessage', () => {
	it('unwraps a JSON provider error nested in responseBody.metadata.raw', () => {
		const raw = JSON.stringify({ error: 'rate limit exceeded' });
		const err = { responseBody: JSON.stringify({ error: { metadata: { raw } } }) };
		expect(_extractErrorMessage(err)).toBe('rate limit exceeded');
	});

	it('returns the raw string when metadata.raw is not JSON', () => {
		const err = { responseBody: JSON.stringify({ error: { metadata: { raw: 'upstream 503' } } }) };
		expect(_extractErrorMessage(err)).toBe('upstream 503');
	});

	it('falls back to error.message inside responseBody', () => {
		const err = { responseBody: JSON.stringify({ error: { message: 'bad request' } }) };
		expect(_extractErrorMessage(err)).toBe('bad request');
	});

	it('recurses into a RetryError lastError', () => {
		expect(_extractErrorMessage({ lastError: new Error('final attempt failed') })).toBe(
			'final attempt failed'
		);
	});

	it('uses the Error message when there is no wrapping', () => {
		expect(_extractErrorMessage(new Error('plain boom'))).toBe('plain boom');
	});

	it('returns a default for unrecognised or malformed values', () => {
		expect(_extractErrorMessage({})).toBe('Unknown error');
		expect(_extractErrorMessage(null)).toBe('Unknown error');
		// Malformed responseBody JSON falls through; a plain object is not an Error.
		expect(_extractErrorMessage({ responseBody: '{not json', message: 'x' })).toBe('Unknown error');
	});
});
