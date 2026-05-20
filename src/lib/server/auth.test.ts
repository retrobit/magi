import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env as _env } from '$env/dynamic/private';
import { checkApiKey } from './auth';

interface MutableEnv {
	MAGI_API_KEY?: string;
}

const env = _env as unknown as MutableEnv;

vi.mock('$env/dynamic/private', () => ({ env: {} as MutableEnv }));

function makeRequest(authHeader?: string) {
	return new Request('http://localhost/x', {
		headers: authHeader ? { authorization: authHeader } : {}
	});
}

beforeEach(() => {
	delete env.MAGI_API_KEY;
});

afterEach(() => {
	delete env.MAGI_API_KEY;
});

describe('checkApiKey', () => {
	it('returns null when MAGI_API_KEY is unset (auth disabled)', () => {
		expect(checkApiKey(makeRequest())).toBeNull();
	});

	it('returns null when the bearer token matches', () => {
		env.MAGI_API_KEY = 'secret';
		expect(checkApiKey(makeRequest('Bearer secret'))).toBeNull();
	});

	it('returns 401 when no Authorization header is present', async () => {
		env.MAGI_API_KEY = 'secret';
		const res = checkApiKey(makeRequest());
		expect(res?.status).toBe(401);
		expect((await res!.json()).error).toBe('Unauthorized');
	});

	it('returns 401 when the bearer prefix is missing', () => {
		env.MAGI_API_KEY = 'secret';
		expect(checkApiKey(makeRequest('secret'))?.status).toBe(401);
	});

	it('returns 401 when the bearer token is wrong', () => {
		env.MAGI_API_KEY = 'secret';
		expect(checkApiKey(makeRequest('Bearer wrong'))?.status).toBe(401);
	});

	it('treats different-length tokens as a mismatch without throwing', () => {
		env.MAGI_API_KEY = 'short';
		expect(checkApiKey(makeRequest('Bearer much-longer-token'))?.status).toBe(401);
	});
});
