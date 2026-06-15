import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamText, generateText } from 'ai';
import { env as _env } from '$env/dynamic/private';
import { isRateLimited } from '$lib/server/rate-limit';
import { isModelHealthy, markUnhealthy } from '$lib/server/health';
import { logEvent } from '$lib/server/logger';
import { POST, _extractErrorMessage, _isAvailabilityError, _scrubErrorMessage } from './+server';

interface MutableEnv {
	MAGI_API_KEY?: string;
}

const env = _env as unknown as MutableEnv;

vi.mock('ai', () => ({ streamText: vi.fn(), generateText: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({ env: {} as MutableEnv }));
vi.mock('$lib/server/rate-limit', () => ({
	isRateLimited: vi.fn(() => false),
	retryAfterSeconds: vi.fn(() => 30)
}));
vi.mock('$lib/server/health', () => ({
	markUnhealthy: vi.fn(),
	isModelHealthy: vi.fn(() => true),
	getHealthStatus: vi.fn(() => undefined),
	clearHealthEntry: vi.fn(),
	UNHEALTHY_TTL: 120_000
}));
vi.mock('$lib/magi/models', () => ({ getModel: vi.fn(() => ({})) }));
vi.mock('$lib/server/openrouter', () => ({ getOpenRouterFreeModels: vi.fn(async () => []) }));
vi.mock('$lib/server/logger', () => ({
	logEvent: vi.fn(),
	startTimer: vi.fn(() => () => 0)
}));

const streamTextMock = vi.mocked(streamText);
const generateTextMock = vi.mocked(generateText);

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
	generateTextMock.mockReset();
	// Default: round-1 reply that converges immediately so debate-strategy tests
	// don't hang or exhaust round retries.
	generateTextMock.mockResolvedValue({
		text: 'CHANGED: no\nAGREE: yes\nNOTE: aligned\nANSWER:\nstable',
		usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 }
	} as never);
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

	it('streams model responses but no consensus events when strategy is none', async () => {
		const events = await readEvents(await callPost({ ...validBody, strategy: 'none' }));
		const got = names(events);
		expect(got).toContain('config');
		expect(got.filter((n) => n === 'model-response')).toHaveLength(3);
		expect(got.filter((n) => n === 'model-usage')).toHaveLength(3);
		// `none` short-circuits before phase 2 — no consensus signals at all.
		expect(got).not.toContain('consensus-chunk');
		expect(got).not.toContain('consensus-complete');
		expect(got).not.toContain('consensus-usage');
		expect(got).not.toContain('partial-consensus');
	});

	it('skips the partial-consensus warning under none even when a node fails', async () => {
		streamTextMock.mockImplementationOnce(() => {
			throw new Error('model boom');
		});
		const events = await readEvents(await callPost({ ...validBody, strategy: 'none' }));
		const got = names(events);
		// The failed node still surfaces via model-error — the user can see which
		// one didn't come back…
		expect(got).toContain('model-error');
		expect(got.filter((n) => n === 'model-response')).toHaveLength(2);
		// …but partial-consensus describes the consensus phase being short on
		// data, which is misleading when no consensus runs at all.
		expect(got).not.toContain('partial-consensus');
		expect(got).not.toContain('consensus-chunk');
		expect(got).not.toContain('consensus-complete');
	});

	it('reseats consensus onto a responding node when the consensus seat fails phase 1', async () => {
		// MAGI_1 is the default consensus seat (config index 0). Fail it in phase 1
		// so the synthesizer would otherwise be asked to run on a model that just
		// errored — the reseat must move consensus onto the first survivor.
		vi.mocked(logEvent).mockClear();
		streamTextMock.mockImplementationOnce(() => {
			throw new Error('seat boom');
		});
		const events = await readEvents(await callPost(validBody));
		// Consensus still completes — produced by a survivor, not the dead seat.
		expect(names(events)).toContain('consensus-complete');
		expect(vi.mocked(logEvent)).toHaveBeenCalledWith(
			'info',
			'consensus.reseat',
			expect.objectContaining({ from: 'MAGI_1', to: 'MAGI_2' })
		);
	});

	it('does not reseat consensus when the seat node responded normally', async () => {
		vi.mocked(logEvent).mockClear();
		await readEvents(await callPost(validBody));
		expect(vi.mocked(logEvent)).not.toHaveBeenCalledWith(
			'info',
			'consensus.reseat',
			expect.anything()
		);
	});

	it('emits a fatal error event when every model is unhealthy', async () => {
		vi.mocked(isModelHealthy).mockReturnValue(false);
		const events = await readEvents(await callPost(validBody));
		expect(names(events).filter((n) => n === 'model-error')).toHaveLength(3);
		const fatal = events.find((e) => e.event === 'error');
		expect(fatal?.data).toEqual({ message: 'All three models are unavailable' });
		expect(names(events)).not.toContain('consensus-complete');
	});

	it('asks each node for a SUMMARY: line when the strategy is debate', async () => {
		await readEvents(await callPost({ ...validBody, strategy: 'debate' }));
		// Phase 1 dispatches one streamText per healthy node — its last user message
		// must carry the SUMMARY ask so the model seals its reply with a one-liner.
		const phase1Calls = streamTextMock.mock.calls.slice(0, 3);
		expect(phase1Calls).toHaveLength(3);
		for (const call of phase1Calls) {
			const messages = call[0].messages as { role: string; content: string }[];
			const last = messages[messages.length - 1];
			expect(last.role).toBe('user');
			expect(last.content).toContain('SUMMARY:');
		}
	});

	it('does not append the SUMMARY ask for non-debate strategies', async () => {
		await readEvents(await callPost(validBody));
		for (const call of streamTextMock.mock.calls) {
			const messages = call[0].messages as { role: string; content: string }[];
			const last = messages[messages.length - 1];
			expect(last.content).not.toContain('SUMMARY:');
		}
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

describe('_scrubErrorMessage', () => {
	it('redacts request URLs that could carry keys in the query string', () => {
		const out = _scrubErrorMessage('failed calling https://api.provider.com/v1/chat?key=abc123');
		expect(out).not.toContain('https://');
		expect(out).toContain('[url]');
	});

	it('redacts API keys and bearer tokens', () => {
		expect(_scrubErrorMessage('bad key sk-or-v1-deadbeefcafe1234')).toContain('[redacted-key]');
		expect(_scrubErrorMessage('Authorization: Bearer eyJhbGciOi.JIUzI1Ni')).toContain(
			'Bearer [redacted]'
		);
	});

	it('redacts absolute filesystem paths and IP:port hosts', () => {
		expect(_scrubErrorMessage('ENOENT at /var/run/secrets/key.pem')).toContain('[path]');
		expect(_scrubErrorMessage('refused by 10.0.0.5:8080')).toContain('[host]');
	});

	it('preserves the human-readable reason the UI relies on', () => {
		expect(_scrubErrorMessage('Rate limit exceeded — 500 requests per day')).toBe(
			'Rate limit exceeded — 500 requests per day'
		);
		expect(_scrubErrorMessage('maximum context length is 8192 tokens')).toContain('context');
	});

	it('caps length and falls back when nothing readable remains', () => {
		const long = 'x'.repeat(500);
		const out = _scrubErrorMessage(long);
		expect(out.length).toBeLessThanOrEqual(300);
		expect(out.endsWith('…')).toBe(true);
		expect(_scrubErrorMessage('   ')).toBe('The model failed to respond.');
	});
});

describe('_isAvailabilityError', () => {
	it('classifies OpenRouter "no endpoints" as an availability error', () => {
		expect(_isAvailabilityError('No endpoints found for this model')).toBe(true);
	});

	it('classifies model-not-found messages as availability errors', () => {
		expect(_isAvailabilityError('model not found: gpt-foo')).toBe(true);
		expect(_isAvailabilityError('The model does not exist')).toBe(true);
	});

	it('classifies HTTP 5xx in the message as availability errors', () => {
		expect(_isAvailabilityError('upstream returned 500')).toBe(true);
		expect(_isAvailabilityError('503 Service Unavailable')).toBe(true);
	});

	it('classifies HTTP 404/410 in the message as availability errors', () => {
		expect(_isAvailabilityError('404 not found')).toBe(true);
		expect(_isAvailabilityError('410 gone')).toBe(true);
	});

	it('does NOT classify context-length errors as availability errors', () => {
		expect(_isAvailabilityError('context length exceeded')).toBe(false);
		expect(_isAvailabilityError('maximum token limit reached')).toBe(false);
	});

	it('does NOT classify auth errors as availability errors', () => {
		expect(_isAvailabilityError('401 Unauthorized')).toBe(false);
		expect(_isAvailabilityError('403 Forbidden')).toBe(false);
		expect(_isAvailabilityError('unauthorized access')).toBe(false);
	});

	it('does NOT classify rate-limit errors as availability errors', () => {
		expect(_isAvailabilityError('429 Too Many Requests')).toBe(false);
		expect(_isAvailabilityError('rate limit exceeded')).toBe(false);
		expect(_isAvailabilityError('rate_limit_error')).toBe(false);
	});

	it('excludes per-request errors even when they contain status-code-shaped numbers', () => {
		// Real upstream messages embed 3-digit numbers that look like 5xx/404
		// codes; the exclusion categories must win over the numeric patterns.
		expect(_isAvailabilityError('maximum context length is 512 tokens')).toBe(false);
		expect(_isAvailabilityError('max_tokens must be at most 512')).toBe(false);
		expect(_isAvailabilityError('You requested 576 tokens but the context window is full')).toBe(
			false
		);
		expect(_isAvailabilityError('Rate limit exceeded: limit of 500 requests per day')).toBe(false);
	});
});

describe('POST /api/magi — health cache & forceRetry', () => {
	it('does not call markUnhealthy for a rate-limit error', async () => {
		vi.mocked(markUnhealthy).mockClear();
		streamTextMock.mockImplementationOnce(() => {
			throw new Error('429 rate limit exceeded');
		});
		await readEvents(await callPost(validBody));
		expect(vi.mocked(markUnhealthy)).not.toHaveBeenCalled();
	});

	it('does not call markUnhealthy for a context-length error', async () => {
		vi.mocked(markUnhealthy).mockClear();
		streamTextMock.mockImplementationOnce(() => {
			throw new Error('context length exceeded');
		});
		await readEvents(await callPost(validBody));
		expect(vi.mocked(markUnhealthy)).not.toHaveBeenCalled();
	});

	it('does not call markUnhealthy for an auth error', async () => {
		vi.mocked(markUnhealthy).mockClear();
		streamTextMock.mockImplementationOnce(() => {
			throw new Error('401 Unauthorized');
		});
		await readEvents(await callPost(validBody));
		expect(vi.mocked(markUnhealthy)).not.toHaveBeenCalled();
	});

	it('still calls markUnhealthy for a 500-class error', async () => {
		vi.mocked(markUnhealthy).mockClear();
		streamTextMock.mockImplementationOnce(() => {
			throw new Error('upstream returned 503');
		});
		await readEvents(await callPost(validBody));
		expect(vi.mocked(markUnhealthy)).toHaveBeenCalledOnce();
	});

	it('clears health entries for all models when forceRetry is true', async () => {
		const { clearHealthEntry } = await import('$lib/server/health');
		vi.mocked(clearHealthEntry).mockClear();
		await readEvents(await callPost({ ...validBody, forceRetry: true }));
		// Three nodes in the balanced config — each must be cleared.
		expect(vi.mocked(clearHealthEntry)).toHaveBeenCalledTimes(3);
	});

	it('does not clear health entries when forceRetry is false', async () => {
		const { clearHealthEntry } = await import('$lib/server/health');
		vi.mocked(clearHealthEntry).mockClear();
		await readEvents(await callPost(validBody));
		expect(vi.mocked(clearHealthEntry)).not.toHaveBeenCalled();
	});
});

describe('POST /api/magi — per-node retry', () => {
	const retryBody = {
		query: 'Hello MAGI',
		tier: 'balanced',
		strategy: 'synthesis',
		retryNodes: ['MAGI_1'],
		priorResponses: [
			{ node: 'MAGI_2', text: 'prior from MAGI_2' },
			{ node: 'MAGI_3', text: 'prior from MAGI_3' }
		]
	};

	it('dispatches only the retried node and feeds priors into consensus', async () => {
		const events = await readEvents(await callPost(retryBody));
		// One model stream for the single retried node + one for consensus = 2.
		// A normal turn would dispatch all three (4 streamText calls).
		expect(streamTextMock).toHaveBeenCalledTimes(2);
		// Only the retried node re-emits a response; the priors aren't re-sent.
		const responded = events
			.filter((e) => e.event === 'model-response')
			.map((e) => (e.data as { node: string }).node);
		expect(responded).toEqual(['MAGI_1']);
		// Consensus still ran, over the full set.
		expect(names(events)).toContain('consensus-complete');
		// The merged priors reached the consensus input.
		const consensusCall = streamTextMock.mock.calls.at(-1)?.[0];
		const blob = JSON.stringify(consensusCall?.messages ?? consensusCall?.prompt ?? '');
		expect(blob).toContain('prior from MAGI_2');
		expect(blob).toContain('prior from MAGI_3');
	});

	it('clears health only for the retried node', async () => {
		const { clearHealthEntry } = await import('$lib/server/health');
		vi.mocked(clearHealthEntry).mockClear();
		await readEvents(await callPost(retryBody));
		expect(vi.mocked(clearHealthEntry)).toHaveBeenCalledTimes(1);
	});

	it('still reaches consensus from priors when the retried node is unhealthy', async () => {
		vi.mocked(isModelHealthy).mockReturnValue(false);
		const events = await readEvents(await callPost(retryBody));
		// The retried node is skipped with a model-error, but the priors carry the
		// turn — no hard "all models unavailable" abort, and consensus still runs.
		expect(names(events)).toContain('model-error');
		expect(names(events)).not.toContain('error');
		expect(names(events)).toContain('consensus-complete');
	});
});

describe('POST /api/magi — awareness→consensus remap', () => {
	// Documented footgun: `temperamentAwareness` in the request is remapped to
	// `ctx.temperaments` in the ConsensusContext (not ctx.temperamentAwareness).
	// That flag is what gates the dispositional-lens guidance paragraph in the
	// synthesis system prompt. The `temperaments` request field maps to
	// `ctx.nodeTemperaments` instead and does NOT affect the consensus prompt.

	it('includes the dispositional-lens guidance when temperamentAwareness is true', async () => {
		await readEvents(await callPost({ ...validBody, temperamentAwareness: true }));
		// The consensus call is the last streamText call.
		const consensusCall = streamTextMock.mock.calls.at(-1)?.[0];
		expect(consensusCall?.system).toMatch(/dispositional lens/);
	});

	it('omits the dispositional-lens guidance when only temperaments is set (awareness absent)', async () => {
		await readEvents(await callPost({ ...validBody, temperaments: true }));
		const consensusCall = streamTextMock.mock.calls.at(-1)?.[0];
		expect(consensusCall?.system).not.toMatch(/dispositional lens/);
	});
});

describe('POST /api/magi — rate limit Retry-After', () => {
	it('returns 429 with a Retry-After header when the client is rate limited', async () => {
		vi.mocked(isRateLimited).mockReturnValue(true);
		const res = await callPost(validBody);
		expect(res.status).toBe(429);
		// The mock returns 30 seconds for retryAfterSeconds.
		expect(res.headers.get('Retry-After')).toBe('30');
	});

	it('includes X-Request-Id on the 429 response', async () => {
		vi.mocked(isRateLimited).mockReturnValue(true);
		const res = await callPost(validBody);
		expect(res.headers.get('X-Request-Id')).toBeTruthy();
	});
});
