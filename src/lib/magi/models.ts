import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
	ANTHROPIC_API_KEY,
	OPENAI_API_KEY,
	GOOGLE_GENERATIVE_AI_API_KEY,
	OPENROUTER_API_KEY
} from '$env/static/private';
import type { GatewayName } from './types';

let _anthropic: ReturnType<typeof createAnthropic>;
let _openai: ReturnType<typeof createOpenAI>;
let _google: ReturnType<typeof createGoogleGenerativeAI>;
let _openrouter: ReturnType<typeof createOpenAI>;

function getClient(gateway: GatewayName) {
	switch (gateway) {
		case 'anthropic':
			return (_anthropic ??= createAnthropic({ apiKey: ANTHROPIC_API_KEY }));
		case 'openai':
			return (_openai ??= createOpenAI({ apiKey: OPENAI_API_KEY }));
		case 'google':
			return (_google ??= createGoogleGenerativeAI({ apiKey: GOOGLE_GENERATIVE_AI_API_KEY }));
		case 'openrouter':
			return (_openrouter ??= createOpenAI({
				apiKey: OPENROUTER_API_KEY,
				baseURL: 'https://openrouter.ai/api/v1',
				headers: {
					'HTTP-Referer': 'https://github.com/retrobit/magi',
					'X-Title': 'MAGI'
				}
			}));
	}
}

export function getModel(gateway: GatewayName, modelId: string) {
	return getClient(gateway)(modelId);
}
