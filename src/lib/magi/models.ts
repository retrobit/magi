import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
	ANTHROPIC_API_KEY,
	OPENAI_API_KEY,
	GOOGLE_GENERATIVE_AI_API_KEY
} from '$env/static/private';
import type { TierName, TierConfig, ProviderName } from './types';

export const TIERS: Record<TierName, TierConfig> = {
	frontier: {
		anthropic: 'claude-opus-4-6',
		openai: 'gpt-5.2',
		google: 'gemini-3.1-pro'
	},
	balanced: {
		anthropic: 'claude-sonnet-4-6',
		openai: 'gpt-4o',
		google: 'gemini-3-flash'
	},
	budget: {
		anthropic: 'claude-haiku-4-5',
		openai: 'gpt-4.1-mini',
		google: 'gemini-3-flash'
	}
};

const anthropic = createAnthropic({ apiKey: ANTHROPIC_API_KEY });
const openai = createOpenAI({ apiKey: OPENAI_API_KEY });
const google = createGoogleGenerativeAI({ apiKey: GOOGLE_GENERATIVE_AI_API_KEY });

export function getModel(provider: ProviderName, tier: TierName) {
	const modelId = TIERS[tier][provider];
	switch (provider) {
		case 'anthropic':
			return anthropic(modelId);
		case 'openai':
			return openai(modelId);
		case 'google':
			return google(modelId);
	}
}
