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
	},
	// OpenRouter — diverse free models for multi-perspective consensus
	{
		id: 'qwen/qwen3-coder:free',
		gateway: 'openrouter',
		provider: 'qwen',
		tier: 'free',
		displayName: 'Qwen3 Coder'
	},
	{
		id: 'nvidia/nemotron-3-super-120b-a12b:free',
		gateway: 'openrouter',
		provider: 'nvidia',
		tier: 'free',
		displayName: 'Nemotron 3 Super'
	},
	{
		id: 'meta-llama/llama-3.3-70b-instruct:free',
		gateway: 'openrouter',
		provider: 'meta-llama',
		tier: 'free',
		displayName: 'Llama 3.3 70B'
	}
];

export function getModelsForTier(tier: TierName): ModelEntry[] {
	return MODEL_REGISTRY.filter((e) => e.tier === tier);
}

export function getModelsForGateway(gateway: GatewayName): ModelEntry[] {
	return MODEL_REGISTRY.filter((e) => e.gateway === gateway);
}

export function getModelsForProvider(provider: ProviderName): ModelEntry[] {
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

export function getProvidersForGateway(gateway: GatewayName): ProviderName[] {
	return [...new Set(MODEL_REGISTRY.filter((e) => e.gateway === gateway).map((e) => e.provider))];
}

export function getModelsForGatewayProvider(
	gateway: GatewayName,
	provider: ProviderName
): ModelEntry[] {
	return MODEL_REGISTRY.filter((e) => e.gateway === gateway && e.provider === provider);
}

export function getAvailableGateways(): GatewayName[] {
	return [...new Set(MODEL_REGISTRY.map((e) => e.gateway))];
}

export function getAvailableProviders(): ProviderName[] {
	return [...new Set(MODEL_REGISTRY.map((e) => e.provider))];
}

export function getGatewaysForTier(tier: TierName): GatewayName[] {
	return [...new Set(MODEL_REGISTRY.filter((e) => e.tier === tier).map((e) => e.gateway))];
}

export function getProvidersForGatewayTier(gateway: GatewayName, tier: TierName): ProviderName[] {
	return [
		...new Set(
			MODEL_REGISTRY.filter((e) => e.gateway === gateway && e.tier === tier).map((e) => e.provider)
		)
	];
}

export function getModelsForGatewayProviderTier(
	gateway: GatewayName,
	provider: ProviderName,
	tier: TierName
): ModelEntry[] {
	return MODEL_REGISTRY.filter(
		(e) => e.gateway === gateway && e.provider === provider && e.tier === tier
	);
}
