import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
	ANTHROPIC_API_KEY,
	OPENAI_API_KEY,
	GOOGLE_GENERATIVE_AI_API_KEY
} from '$env/static/private';
import type { TierName, ProviderName } from './types';
import { getModelEntry } from './registry';

let _anthropic: ReturnType<typeof createAnthropic>;
let _openai: ReturnType<typeof createOpenAI>;
let _google: ReturnType<typeof createGoogleGenerativeAI>;

function getClient(provider: ProviderName) {
	switch (provider) {
		case 'anthropic':
			return (_anthropic ??= createAnthropic({ apiKey: ANTHROPIC_API_KEY }));
		case 'openai':
			return (_openai ??= createOpenAI({ apiKey: OPENAI_API_KEY }));
		case 'google':
			return (_google ??= createGoogleGenerativeAI({ apiKey: GOOGLE_GENERATIVE_AI_API_KEY }));
	}
}

export function getModel(provider: ProviderName, tier: TierName) {
	const entry = getModelEntry(provider, tier);
	return getClient(provider)(entry.id);
}
