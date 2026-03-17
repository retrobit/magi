export type TierName = 'free' | 'frontier' | 'balanced' | 'budget';

export type ProviderName = 'anthropic' | 'openai' | 'google';

export type MagiNodeName = 'MELCHIOR' | 'BALTHASAR' | 'CASPAR';

export interface MagiNode {
	name: MagiNodeName;
	provider: ProviderName;
}

export interface MagiResponse {
	node: MagiNode;
	text: string;
}

export interface TierConfig {
	anthropic: string;
	openai: string;
	google: string;
}

export const MAGI_NODES: MagiNode[] = [
	{ name: 'MELCHIOR', provider: 'anthropic' },
	{ name: 'BALTHASAR', provider: 'openai' },
	{ name: 'CASPAR', provider: 'google' }
];
