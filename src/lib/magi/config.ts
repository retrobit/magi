import type { MagiNodeName, ProviderName } from './types';
import { MAGI_NODE_NAMES } from './types';

export const DEFAULT_CONSENSUS_PROVIDER: ProviderName = 'anthropic';

export interface NodeAssignment {
	node: MagiNodeName;
	provider: ProviderName;
}

export type MagiConfig = readonly [NodeAssignment, NodeAssignment, NodeAssignment];

export const DEFAULT_MAGI_CONFIG: MagiConfig = [
	{ node: 'MELCHIOR', provider: 'anthropic' },
	{ node: 'BALTHASAR', provider: 'openai' },
	{ node: 'CASPAR', provider: 'google' }
];

export function validateConfig(config: MagiConfig): void {
	const nodes = config.map((a) => a.node);
	const providers = config.map((a) => a.provider);

	if (new Set(nodes).size !== nodes.length) {
		throw new Error('Duplicate nodes in MAGI config: each node must appear exactly once');
	}

	for (const name of MAGI_NODE_NAMES) {
		if (!nodes.includes(name)) {
			throw new Error(`Missing node assignment for ${name}`);
		}
	}

	if (new Set(providers).size !== providers.length) {
		throw new Error('Duplicate providers in MAGI config: each node must use a unique provider');
	}
}
