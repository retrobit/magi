import type { TierName, GatewayName, ProviderName } from './types';

export interface ModelEntry {
	id: string;
	gateway: GatewayName;
	provider: ProviderName;
	tier: TierName;
	displayName: string;
}

export const MODEL_REGISTRY: readonly ModelEntry[] = [
	// Anthropic (direct)
	{
		id: 'claude-opus-4-6',
		gateway: 'anthropic',
		provider: 'anthropic',
		tier: 'frontier',
		displayName: 'Claude Opus 4.6'
	},
	{
		id: 'claude-sonnet-4-6',
		gateway: 'anthropic',
		provider: 'anthropic',
		tier: 'balanced',
		displayName: 'Claude Sonnet 4.6'
	},
	{
		id: 'claude-haiku-4-5',
		gateway: 'anthropic',
		provider: 'anthropic',
		tier: 'budget',
		displayName: 'Claude Haiku 4.5'
	},
	// OpenAI (direct)
	{
		id: 'gpt-5.2',
		gateway: 'openai',
		provider: 'openai',
		tier: 'frontier',
		displayName: 'GPT-5.2'
	},
	{ id: 'gpt-4o', gateway: 'openai', provider: 'openai', tier: 'balanced', displayName: 'GPT-4o' },
	{
		id: 'gpt-4.1-mini',
		gateway: 'openai',
		provider: 'openai',
		tier: 'budget',
		displayName: 'GPT-4.1 Mini'
	},
	// Google (direct)
	{
		id: 'gemini-2.5-pro',
		gateway: 'google',
		provider: 'google',
		tier: 'frontier',
		displayName: 'Gemini 2.5 Pro'
	},
	{
		id: 'gemini-2.5-flash',
		gateway: 'google',
		provider: 'google',
		tier: 'balanced',
		displayName: 'Gemini 2.5 Flash'
	},
	{
		id: 'gemini-2.5-flash-lite',
		gateway: 'google',
		provider: 'google',
		tier: 'budget',
		displayName: 'Gemini 2.5 Flash Lite'
	}
];

export function getModelsForTier(tier: TierName): ModelEntry[] {
	return MODEL_REGISTRY.filter((e) => e.tier === tier);
}

export function getModelsForGateway(gateway: GatewayName): ModelEntry[] {
	return MODEL_REGISTRY.filter((e) => e.gateway === gateway);
}

export function getModelsForProvider(provider: string): ModelEntry[] {
	return MODEL_REGISTRY.filter((e) => e.provider === provider);
}

export function findModelEntry(
	gateway: GatewayName,
	modelId: string,
	tier?: TierName
): ModelEntry | undefined {
	return MODEL_REGISTRY.find(
		(e) => e.gateway === gateway && e.id === modelId && (!tier || e.tier === tier)
	);
}

export function getAvailableGateways(): GatewayName[] {
	return [...new Set(MODEL_REGISTRY.map((e) => e.gateway))];
}

export function getAvailableProviders(): string[] {
	return [...new Set(MODEL_REGISTRY.map((e) => e.provider))];
}
