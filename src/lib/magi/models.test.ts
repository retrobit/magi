import { describe, it, expect, vi, beforeAll } from 'vitest';
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
