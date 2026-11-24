import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createAnthropic } from '@ai-sdk/anthropic';
import { env } from '$env/dynamic/private';
import { getModel } from './models';

vi.mock('$env/dynamic/private', () => ({ env: {} as Record<string, string | undefined> }));

vi.mock('@ai-sdk/anthropic', () => ({
	createAnthropic: vi.fn(() => vi.fn((id: string) => ({ kind: 'anthropic', id })))
}));

vi.mock('@ai-sdk/google', () => ({
	createGoogleGenerativeAI: vi.fn(() => vi.fn((id: string) => ({ kind: 'google', id })))
}));

vi.mock('@ai-sdk/openai', () => ({
	createOpenAI: vi.fn(() =>
		Object.assign(
			vi.fn((id: string) => ({ kind: 'openai', id })),
			{
				chat: vi.fn((id: string) => ({ kind: 'openai-chat', id }))
			}
		)
	)
}));

describe('getModel without API keys', () => {
	it('throws a descriptive error when the gateway key is absent', () => {
		expect(() => getModel('anthropic', 'claude-x')).toThrow(
			'Missing environment variable: ANTHROPIC_API_KEY'
		);
		expect(() => getModel('openai', 'gpt-x')).toThrow(
			'Missing environment variable: OPENAI_API_KEY'
		);
		expect(() => getModel('google', 'gemini-x')).toThrow(
			'Missing environment variable: GOOGLE_GENERATIVE_AI_API_KEY'
		);
		expect(() => getModel('openrouter', 'vendor/x:free')).toThrow(
			'Missing environment variable: OPENROUTER_API_KEY'
		);
	});
});

describe('getModel with API keys', () => {
	beforeAll(() => {
		Object.assign(env, {
			ANTHROPIC_API_KEY: 'a-key',
			OPENAI_API_KEY: 'o-key',
			GOOGLE_GENERATIVE_AI_API_KEY: 'g-key',
			OPENROUTER_API_KEY: 'r-key'
		});
	});

	it('builds a model through the direct builder for Anthropic and Google', () => {
		expect(getModel('anthropic', 'claude-x')).toMatchObject({ kind: 'anthropic', id: 'claude-x' });
		expect(getModel('google', 'gemini-x')).toMatchObject({ kind: 'google', id: 'gemini-x' });
	});

	it('uses the plain builder for direct OpenAI', () => {
		expect(getModel('openai', 'gpt-x')).toMatchObject({ kind: 'openai', id: 'gpt-x' });
	});

	it('routes OpenRouter through the chat() builder', () => {
		expect(getModel('openrouter', 'vendor/x:free')).toMatchObject({
			kind: 'openai-chat',
			id: 'vendor/x:free'
		});
	});

	it('creates each gateway client once and reuses it across calls', () => {
		getModel('anthropic', 'claude-y');
		getModel('anthropic', 'claude-z');
		expect(createAnthropic).toHaveBeenCalledOnce();
	});
});

describe('getModel with BYOK keys', () => {
	beforeEach(() => {
		vi.mocked(createAnthropic).mockClear();
	});

	it('prefers a visitor BYOK key over the operator env key', () => {
		getModel('anthropic', 'claude-x', { anthropic: 'byok-anthropic-key' });
		expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'byok-anthropic-key' });
	});

	it('builds a throwaway client per call — never caches a visitor key', () => {
		// The key-isolation invariant: two calls with different visitor keys must
		// each build their own client with their own key, so one caller's key can
		// never bleed into another request served by the same warm instance.
		getModel('anthropic', 'claude-x', { anthropic: 'key-visitor-1' });
		getModel('anthropic', 'claude-x', { anthropic: 'key-visitor-2' });
		expect(createAnthropic).toHaveBeenCalledTimes(2);
		expect(createAnthropic).toHaveBeenNthCalledWith(1, { apiKey: 'key-visitor-1' });
		expect(createAnthropic).toHaveBeenNthCalledWith(2, { apiKey: 'key-visitor-2' });
	});

	it('routes an OpenRouter BYOK key through the chat() builder', () => {
		expect(getModel('openrouter', 'vendor/x', { openrouter: 'byok-or-key' })).toMatchObject({
			kind: 'openai-chat',
			id: 'vendor/x'
		});
	});

	it('ignores a BYOK object that does not cover the requested gateway', () => {
		// A BYOK openai key on an anthropic request → the env-keyed singleton is
		// used (createAnthropic not re-invoked for a throwaway client).
		getModel('anthropic', 'claude-x', { openai: 'byok-openai-only' });
		expect(createAnthropic).not.toHaveBeenCalled();
	});
});
