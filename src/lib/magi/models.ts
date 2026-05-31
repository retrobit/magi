import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { env } from '$env/dynamic/private';
import type { GatewayName } from './types';

let _anthropic: ReturnType<typeof createAnthropic>;
let _openai: ReturnType<typeof createOpenAI>;
let _google: ReturnType<typeof createGoogleGenerativeAI>;
let _openrouter: ReturnType<typeof createOpenAI>;

function requireKey(name: string): string {
	const key = env[name];
	if (!key) throw new Error(`Missing environment variable: ${name}`);
	return key;
}

function getClient(gateway: GatewayName) {
	switch (gateway) {
		case 'anthropic':
			return (_anthropic ??= createAnthropic({ apiKey: requireKey('ANTHROPIC_API_KEY') }));
		case 'openai':
			return (_openai ??= createOpenAI({ apiKey: requireKey('OPENAI_API_KEY') }));
		case 'google':
			return (_google ??= createGoogleGenerativeAI({
				apiKey: requireKey('GOOGLE_GENERATIVE_AI_API_KEY')
			}));
		case 'openrouter':
			// OpenRouter uses HTTP-Referer + X-Title for attribution on its
			// rankings/dashboards. Defaults point at the canonical repo, but
			// deployed instances should override via env so traffic isn't
			// misattributed to upstream.
			return (_openrouter ??= createOpenAI({
				apiKey: requireKey('OPENROUTER_API_KEY'),
				baseURL: 'https://openrouter.ai/api/v1',
				headers: {
					'HTTP-Referer': env.OPENROUTER_REFERER || 'https://github.com/retrobit/magi',
					'X-Title': env.OPENROUTER_TITLE || 'MAGI'
				}
			}));
	}
}

export function getModel(gateway: GatewayName, modelId: string) {
	const client = getClient(gateway);
	if (gateway === 'openrouter') return client.chat(modelId);
	return client(modelId);
}
