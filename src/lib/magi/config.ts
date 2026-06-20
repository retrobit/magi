import type { MagiNodeName, GatewayName, TierName, AvailableModel } from './types';
import { MAGI_NODE_NAMES, isRouter, pickDiverseModels } from './types';

export interface NodeAssignment {
	node: MagiNodeName;
	gateway: GatewayName;
	provider: string;
	modelId: string;
}

export type MagiConfig = readonly [NodeAssignment, NodeAssignment, NodeAssignment];

/** Seed a 3-node assignment from a model list, choosing maximally diverse
 *  providers. Shared by the client (free-tier defaults) and the server
 *  (free-tier request resolution) so both pick models the same way. */
export function buildDiverseConfig(models: AvailableModel[]): NodeAssignment[] {
	return pickDiverseModels(models, MAGI_NODE_NAMES.length).map((m, i) => ({
		node: MAGI_NODE_NAMES[i],
		gateway: m.gateway,
		provider: m.provider,
		modelId: m.id
	}));
}

export const DEFAULT_MAGI_CONFIG: MagiConfig = [
	{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-sonnet-4-6' },
	{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', modelId: 'gpt-5.4' },
	{ node: 'MAGI_3', gateway: 'google', provider: 'google', modelId: 'gemini-3.5-flash' }
];

export const FREE_MAGI_CONFIG: MagiConfig = [
	{ node: 'MAGI_1', gateway: 'openrouter', provider: 'qwen', modelId: 'qwen/qwen3-coder:free' },
	{
		node: 'MAGI_2',
		gateway: 'openrouter',
		provider: 'nvidia',
		modelId: 'nvidia/nemotron-3-super-120b-a12b:free'
	},
	{
		node: 'MAGI_3',
		gateway: 'openrouter',
		provider: 'meta-llama',
		modelId: 'meta-llama/llama-3.3-70b-instruct:free'
	}
];

/** Maps each tier to its node configuration. */
export const TIER_CONFIGS: Record<TierName, MagiConfig> = {
	frontier: [
		{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-opus-4-8' },
		{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', modelId: 'gpt-5.5' },
		{ node: 'MAGI_3', gateway: 'google', provider: 'google', modelId: 'gemini-2.5-pro' }
	],
	balanced: DEFAULT_MAGI_CONFIG,
	budget: [
		{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-haiku-4-5' },
		{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', modelId: 'gpt-5.4-mini' },
		{ node: 'MAGI_3', gateway: 'google', provider: 'google', modelId: 'gemini-3.1-flash-lite' }
	],
	free: FREE_MAGI_CONFIG
};

export function validateConfig(config: MagiConfig): void {
	const nodes = config.map((a) => a.node);
	const providers = config.map((a) => a.provider);
	const modelIds = config.map((a) => a.modelId);
	const gateways = config.map((a) => a.gateway);

	// All three canonical nodes must be present exactly once
	if (new Set(nodes).size !== nodes.length) {
		throw new Error('Duplicate nodes in MAGI config: each node must appear exactly once');
	}
	for (const name of MAGI_NODE_NAMES) {
		if (!nodes.includes(name)) {
			throw new Error(`Missing node assignment for ${name}`);
		}
	}

	// Providers must be unique across all nodes (the core diversity rule)
	if (new Set(providers).size !== providers.length) {
		throw new Error('Duplicate providers in MAGI config: each node must use a unique provider');
	}

	// Models must be unique across all nodes
	if (new Set(modelIds).size !== modelIds.length) {
		throw new Error('Duplicate models in MAGI config: each node must use a unique model');
	}

	// Gateways may repeat only if they are routers
	const gatewayCount = new Map<GatewayName, number>();
	for (const gw of gateways) {
		gatewayCount.set(gw, (gatewayCount.get(gw) ?? 0) + 1);
	}
	for (const [gw, count] of gatewayCount) {
		if (count > 1 && !isRouter(gw)) {
			throw new Error(
				`Direct gateway "${gw}" used by multiple nodes: only router gateways may be shared`
			);
		}
	}
}
