export const TIER_NAMES = ['free', 'budget', 'balanced', 'frontier'] as const;
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
	'qwen',
	'nvidia',
	'meta-llama'
] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

// Named after the three MAGI supercomputers from Neon Genesis Evangelion
export const MAGI_NODE_NAMES = ['MELCHIOR', 'BALTHASAR', 'CASPAR'] as const;
export type MagiNodeName = (typeof MAGI_NODE_NAMES)[number];

export const TEMPERAMENT_NAMES = ['rationalist', 'caretaker', 'individualist'] as const;
export type TemperamentName = (typeof TEMPERAMENT_NAMES)[number];

export const NODE_LABELS: Record<MagiNodeName, string> = {
	MELCHIOR: 'MELCHIOR \u2022 1',
	BALTHASAR: 'BALTHASAR \u2022 2',
	CASPAR: 'CASPAR \u2022 3'
};

export const NODE_LABELS_GENERIC: Record<MagiNodeName, string> = {
	MELCHIOR: 'MAGI \u2022 1',
	BALTHASAR: 'MAGI \u2022 2',
	CASPAR: 'MAGI \u2022 3'
};

export const TEMPERAMENT_LABELS: Record<TemperamentName, string> = {
	rationalist: 'Rationalist',
	caretaker: 'Caretaker',
	individualist: 'Individualist'
};

export const NODE_TEMPERAMENTS: Record<MagiNodeName, TemperamentName> = {
	MELCHIOR: 'rationalist',
	BALTHASAR: 'caretaker',
	CASPAR: 'individualist'
};

export interface MagiNode {
	name: MagiNodeName;
	temperament: TemperamentName;
}

export interface MagiResponse {
	node: MagiNodeName;
	gateway: GatewayName;
	provider: ProviderName;
	text: string;
}

export const NODE_COLORS: Record<MagiNodeName, string> = {
	MELCHIOR: 'border-orange-500',
	BALTHASAR: 'border-blue-500',
	CASPAR: 'border-emerald-400'
};

export const NODE_HEX_COLORS: Record<MagiNodeName, string> = {
	MELCHIOR: '#f97316',
	BALTHASAR: '#3b82f6',
	CASPAR: '#34d399'
};

export const CONSENSUS_GRADIENT = `background: linear-gradient(to right, ${MAGI_NODE_NAMES.map((n) => NODE_HEX_COLORS[n]).join(', ')})`;

export const GATEWAY_LABELS: Record<GatewayName, string> = {
	anthropic: 'Anthropic',
	openai: 'OpenAI',
	google: 'Google',
	openrouter: 'OpenRouter'
};

export const PROVIDER_LABELS: Record<ProviderName, string> = {
	anthropic: 'Anthropic',
	openai: 'OpenAI',
	google: 'Google',
	qwen: 'Qwen',
	nvidia: 'NVIDIA',
	'meta-llama': 'Meta'
};

export const MAGI_NODES: readonly MagiNode[] = [
	{ name: 'MELCHIOR', temperament: 'rationalist' },
	{ name: 'BALTHASAR', temperament: 'caretaker' },
	{ name: 'CASPAR', temperament: 'individualist' }
];
