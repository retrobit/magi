import type { TierName, ProviderName } from './types';

export interface ModelEntry {
	id: string;
	provider: ProviderName;
	tier: TierName;
	displayName: string;
}

export const MODEL_REGISTRY: readonly ModelEntry[] = [
	// Anthropic
	{
		id: 'claude-opus-4-6',
		provider: 'anthropic',
		tier: 'frontier',
		displayName: 'Claude Opus 4.6'
	},
	{
		id: 'claude-sonnet-4-6',
		provider: 'anthropic',
		tier: 'balanced',
		displayName: 'Claude Sonnet 4.6'
	},
	{
		id: 'claude-haiku-4-5',
		provider: 'anthropic',
		tier: 'budget',
		displayName: 'Claude Haiku 4.5'
	},
	// OpenAI
	{ id: 'gpt-5.2', provider: 'openai', tier: 'frontier', displayName: 'GPT-5.2' },
	{ id: 'gpt-4o', provider: 'openai', tier: 'balanced', displayName: 'GPT-4o' },
	{ id: 'gpt-4.1-mini', provider: 'openai', tier: 'budget', displayName: 'GPT-4.1 Mini' },
	// Google
	{ id: 'gemini-3.1-pro', provider: 'google', tier: 'frontier', displayName: 'Gemini 3.1 Pro' },
	// Intentionally the same model for balanced and budget — no cheaper Google tier available yet
	{ id: 'gemini-3-flash', provider: 'google', tier: 'balanced', displayName: 'Gemini 3 Flash' },
	{ id: 'gemini-3-flash', provider: 'google', tier: 'budget', displayName: 'Gemini 3 Flash' }
];

export function getModelEntry(provider: ProviderName, tier: TierName): ModelEntry {
	const entry = MODEL_REGISTRY.find((e) => e.provider === provider && e.tier === tier);
	if (!entry) {
		throw new Error(`No model registered for provider "${provider}" at tier "${tier}"`);
	}
	return entry;
}

export function getModelsForProvider(provider: ProviderName): ModelEntry[] {
	return MODEL_REGISTRY.filter((e) => e.provider === provider);
}

export function getAvailableProviders(): ProviderName[] {
	return [...new Set(MODEL_REGISTRY.map((e) => e.provider))];
}
