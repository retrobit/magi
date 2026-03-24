export const TIER_NAMES = ['frontier', 'balanced', 'budget', 'free'] as const;
export type TierName = (typeof TIER_NAMES)[number];
export const DEFAULT_TIER: TierName = 'free';

export const GATEWAY_NAMES = ['anthropic', 'openai', 'google', 'openrouter'] as const;
export type GatewayName = (typeof GATEWAY_NAMES)[number];

export const ROUTER_GATEWAYS: readonly GatewayName[] = ['openrouter'] as const;
export function isRouter(gateway: GatewayName): boolean {
	return (ROUTER_GATEWAYS as readonly string[]).includes(gateway);
}

export const PROVIDER_NAMES = [
	'anthropic',
	'openai',
	'google',
	'stepfun',
	'nvidia',
	'arcee-ai'
] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export const MAGI_NODE_NAMES = ['MELCHIOR', 'BALTHASAR', 'CASPAR'] as const;
export type MagiNodeName = (typeof MAGI_NODE_NAMES)[number];

export interface MagiNode {
	name: MagiNodeName;
}

export interface MagiResponse {
	node: MagiNodeName;
	gateway: GatewayName;
	provider: ProviderName;
	text: string;
}

// Reserved for future per-node personality/system-prompt configuration
export const MAGI_NODES: readonly MagiNode[] = [
	{ name: 'MELCHIOR' },
	{ name: 'BALTHASAR' },
	{ name: 'CASPAR' }
];
