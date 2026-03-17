import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { TierName, TierConfig, ProviderName } from './types';

export const TIERS: Record<TierName, TierConfig> = {
	free: {
		anthropic: 'nvidia/nemotron-3-super-120b-a12b:free',
		openai: 'arcee-ai/trinity-large-preview:free',
		google: 'stepfun/step-3.5-flash:free'
	},
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

const anthropic = createAnthropic();
const openai = createOpenAI();
const google = createGoogleGenerativeAI();
const openrouter = createOpenAI({
	baseURL: 'https://openrouter.ai/api/v1',
	apiKey: process.env.OPENROUTER_API_KEY
});

export function getModel(provider: ProviderName, tier: TierName) {
	const modelId = TIERS[tier][provider];
	if (tier === 'free') {
		return openrouter.chat(modelId);
	}
	switch (provider) {
		case 'anthropic':
			return anthropic(modelId);
		case 'openai':
			return openai(modelId);
		case 'google':
			return google(modelId);
	}
}
