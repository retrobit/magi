import type { MagiNodeName, GatewayName, TierName, AvailableModel } from './types';
import { MAGI_NODE_NAMES, isRouter, pickDiverseModels } from './types';

export interface NodeAssignment {
	node: MagiNodeName;
	gateway: GatewayName;
	provider: string;
	modelId: string;
}

export type MagiConfig = readonly [NodeAssignment, NodeAssignment, NodeAssignment];

/** Ranked short-list of reliable, coherent free models — more than the three
 *  seats on purpose, so the demo's seats are always drawn from known-good models
 *  in rank order, not the flaky long tail (poolside/tencent return empty,
 *  cohere/north-mini-code is code-only, the popular general models — llama-3.3,
 *  qwen3-next, gpt-oss — 429 under load or vanish). Reliability outranks provider
 *  diversity here (see buildDiverseConfig). Re-probe live when refreshing this
 *  list — catalog presence != a coherent reply; last probed 2026-07-14 (launch
 *  day), every entry 2/2 coherent under repeat probes. */
export const PREFERRED_FREE_MODEL_IDS = [
	'nvidia/nemotron-3-super-120b-a12b:free',
	'google/gemma-4-26b-a4b-it:free',
	'nvidia/nemotron-3-ultra-550b-a55b:free',
	'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
	'nvidia/nemotron-3-nano-30b-a3b:free'
];

/** Seed a 3-node assignment from a model list. Shared by the client (free-tier
 *  defaults) and the server (free-tier request resolution) so both pick models
 *  the same way. Preferred free defaults (when present) seat first — EVEN when
 *  that repeats a provider: the list is hand-curated for reliability, and on the
 *  free tier a stable same-provider seat beats a "diverse" seat that 429s or
 *  returns empty (when only two providers are healthy, strict one-per-provider
 *  seating would force seat 3 onto a broken one). Provider diversity still
 *  governs the backfill and the rest of the pool. */
export function buildDiverseConfig(models: AvailableModel[]): NodeAssignment[] {
	const byId = new Map(models.map((m) => [m.id, m]));
	const seats = PREFERRED_FREE_MODEL_IDS.map((id) => byId.get(id))
		.filter((m): m is AvailableModel => m !== undefined)
		.slice(0, MAGI_NODE_NAMES.length);
	if (seats.length < MAGI_NODE_NAMES.length) {
		// Not enough preferred models in the pool — diverse-pick the remaining
		// seats from the leftovers (one per provider first, then any).
		const seated = new Set(seats);
		const rest = models.filter((m) => !seated.has(m));
		seats.push(...pickDiverseModels(rest, MAGI_NODE_NAMES.length - seats.length));
	}
	return seats.map((m, i) => ({
		node: MAGI_NODE_NAMES[i],
		gateway: m.gateway,
		provider: m.provider,
		modelId: m.id
	}));
}

export const DEFAULT_MAGI_CONFIG: MagiConfig = [
	{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-sonnet-5' },
	{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', modelId: 'gpt-5.4' },
	{ node: 'MAGI_3', gateway: 'google', provider: 'google', modelId: 'gemini-3.5-flash' }
];

// Static fallback when the live OpenRouter list can't be fetched — kept in sync
// with PREFERRED_FREE_MODEL_IDS so the demo's reliable trio shows even offline.
export const FREE_MAGI_CONFIG: MagiConfig = [
	{
		node: 'MAGI_1',
		gateway: 'openrouter',
		provider: 'nvidia',
		modelId: 'nvidia/nemotron-3-super-120b-a12b:free'
	},
	{
		node: 'MAGI_2',
		gateway: 'openrouter',
		provider: 'google',
		modelId: 'google/gemma-4-26b-a4b-it:free'
	},
	{
		node: 'MAGI_3',
		gateway: 'openrouter',
		provider: 'nvidia',
		modelId: 'nvidia/nemotron-3-ultra-550b-a55b:free'
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

	// Providers must be unique across the DIRECT-gateway nodes (the core diversity
	// rule — provider independence is the pitch of the paid tiers). Router seats
	// are exempt, mirroring the gateway rule below: a router's `provider` is a
	// community sub-label, and free-tier reliability may deliberately seat two
	// models from the same healthy sub-provider (see PREFERRED_FREE_MODEL_IDS).
	const directProviders = config.filter((a) => !isRouter(a.gateway)).map((a) => a.provider);
	if (new Set(directProviders).size !== directProviders.length) {
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
