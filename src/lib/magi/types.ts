export const TIER_NAMES = ['frontier', 'balanced', 'budget'] as const;
export type TierName = (typeof TIER_NAMES)[number];
export const DEFAULT_TIER: TierName = 'balanced';

export const PROVIDER_NAMES = ['anthropic', 'openai', 'google'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export const MAGI_NODE_NAMES = ['MELCHIOR', 'BALTHASAR', 'CASPAR'] as const;
export type MagiNodeName = (typeof MAGI_NODE_NAMES)[number];

export interface MagiNode {
	name: MagiNodeName;
}

export interface MagiResponse {
	node: MagiNodeName;
	provider: ProviderName;
	text: string;
}

// Reserved for future per-node personality/system-prompt configuration
export const MAGI_NODES: readonly MagiNode[] = [
	{ name: 'MELCHIOR' },
	{ name: 'BALTHASAR' },
	{ name: 'CASPAR' }
];
