import { describe, it, expect } from 'vitest';
import { extractErrorMessage, isAvailabilityError, isAuthError } from './upstream-errors';

describe('extractErrorMessage', () => {
	it('unwraps a JSON provider error nested in responseBody.metadata.raw', () => {
		const raw = JSON.stringify({ error: 'rate limit exceeded' });
		const err = { responseBody: JSON.stringify({ error: { metadata: { raw } } }) };
		expect(extractErrorMessage(err)).toBe('rate limit exceeded');
	});

	it('returns the raw string when metadata.raw is not JSON', () => {
		const err = { responseBody: JSON.stringify({ error: { metadata: { raw: 'upstream 503' } } }) };
		expect(extractErrorMessage(err)).toBe('upstream 503');
	});

	it('falls back to error.message inside responseBody', () => {
		const err = { responseBody: JSON.stringify({ error: { message: 'bad request' } }) };
		expect(extractErrorMessage(err)).toBe('bad request');
	});

	it('recurses into a RetryError lastError', () => {
		expect(extractErrorMessage({ lastError: new Error('final attempt failed') })).toBe(
			'final attempt failed'
		);
	});

	it('uses the Error message when there is no wrapping', () => {
		expect(extractErrorMessage(new Error('plain boom'))).toBe('plain boom');
	});

	it('returns a default for unrecognised or malformed values', () => {
		expect(extractErrorMessage({})).toBe('Unknown error');
		expect(extractErrorMessage(null)).toBe('Unknown error');
		// Malformed responseBody JSON falls through; a plain object is not an Error.
		expect(extractErrorMessage({ responseBody: '{not json', message: 'x' })).toBe('Unknown error');
	});
});

describe('isAvailabilityError', () => {
	it('classifies OpenRouter "no endpoints" as an availability error', () => {
		expect(isAvailabilityError('No endpoints found for this model')).toBe(true);
	});

	it('classifies model-not-found messages as availability errors', () => {
		expect(isAvailabilityError('model not found: gpt-foo')).toBe(true);
		expect(isAvailabilityError('The model does not exist')).toBe(true);
	});

	it('classifies HTTP 5xx in the message as availability errors', () => {
		expect(isAvailabilityError('upstream returned 500')).toBe(true);
		expect(isAvailabilityError('503 Service Unavailable')).toBe(true);
	});

	it('classifies HTTP 404/410 in the message as availability errors', () => {
		expect(isAvailabilityError('404 not found')).toBe(true);
		expect(isAvailabilityError('410 gone')).toBe(true);
	});

	it('does NOT classify context-length errors as availability errors', () => {
		expect(isAvailabilityError('context length exceeded')).toBe(false);
		expect(isAvailabilityError('maximum token limit reached')).toBe(false);
	});

	it('does NOT classify auth errors as availability errors', () => {
		expect(isAvailabilityError('401 Unauthorized')).toBe(false);
		expect(isAvailabilityError('403 Forbidden')).toBe(false);
		expect(isAvailabilityError('unauthorized access')).toBe(false);
	});

	it('does NOT classify rate-limit errors as availability errors', () => {
		expect(isAvailabilityError('429 Too Many Requests')).toBe(false);
		expect(isAvailabilityError('rate limit exceeded')).toBe(false);
		expect(isAvailabilityError('rate_limit_error')).toBe(false);
	});

	it('excludes per-request errors even when they contain status-code-shaped numbers', () => {
		// Real upstream messages embed 3-digit numbers that look like 5xx/404
		// codes; the exclusion categories must win over the numeric patterns.
		expect(isAvailabilityError('maximum context length is 512 tokens')).toBe(false);
		expect(isAvailabilityError('max_tokens must be at most 512')).toBe(false);
		expect(isAvailabilityError('You requested 576 tokens but the context window is full')).toBe(
			false
		);
		expect(isAvailabilityError('Rate limit exceeded: limit of 500 requests per day')).toBe(false);
	});
});

describe('isAuthError', () => {
	it('detects a 401/403 status code on the raw error object', () => {
		expect(isAuthError({ statusCode: 401 })).toBe(true);
		expect(isAuthError({ statusCode: 403 })).toBe(true);
		expect(isAuthError({ statusCode: 500 })).toBe(false);
	});

	it('detects auth-shaped text in the response body or message', () => {
		expect(isAuthError({ responseBody: '{"error":{"message":"User not found","code":401}}' })).toBe(
			true
		);
		expect(isAuthError({ message: 'Unauthorized' })).toBe(true);
		expect(isAuthError({ message: 'invalid api key' })).toBe(true);
		expect(isAuthError({ message: 'No auth credentials found' })).toBe(true);
	});

	it('unwraps a nested cause — the AI SDK buries the APICallError there', () => {
		expect(isAuthError({ message: 'No output generated', cause: { statusCode: 401 } })).toBe(true);
	});

	it('returns false for non-auth failures and non-objects', () => {
		expect(isAuthError({ statusCode: 429, message: 'rate limit' })).toBe(false);
		expect(isAuthError(new Error('model not found'))).toBe(false);
		expect(isAuthError(null)).toBe(false);
		// Strings aren't walked — the classifier needs the raw error object.
		expect(isAuthError('401 unauthorized')).toBe(false);
	});

	it('does not infinitely recurse on a cyclic cause chain', () => {
		const cyclic: { cause?: unknown } = {};
		cyclic.cause = cyclic;
		expect(isAuthError(cyclic)).toBe(false);
	});
});
