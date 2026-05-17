export const TIER_NAMES = ['free', 'budget', 'balanced', 'frontier'] as const;
export type TierName = (typeof TIER_NAMES)[number];
export const DEFAULT_TIER: TierName = 'free';

export const GATEWAY_NAMES = ['anthropic', 'openai', 'google', 'openrouter'] as const;
export type GatewayName = (typeof GATEWAY_NAMES)[number];

export const ROUTER_GATEWAYS: readonly GatewayName[] = ['openrouter'] as const;
export function isRouter(gateway: GatewayName): boolean {
	return (ROUTER_GATEWAYS as readonly string[]).includes(gateway);
}

export const PROVIDER_NAMES = ['anthropic', 'openai', 'google'] as const;
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
	provider: string;
	text: string;
}

export interface AvailableModel {
	id: string;
	gateway: GatewayName;
	provider: string;
	displayName: string;
	/** Context window in tokens, when known — drives context-budget warnings. */
	contextLength?: number;
}

/** Compact token display: 7100 → "7.1k", 200000 → "200k", 1000000 → "1M". */
export function formatTokenCount(n: number): string {
	if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
	if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
	return String(n);
}

/** Tailwind text colour for a context-window usage gauge: red near full,
 *  amber when getting close, neutral otherwise. */
export function contextUsageClass(used: number, window: number | undefined): string {
	const ratio = window ? used / window : 0;
	if (ratio >= 0.9) return 'text-red-400';
	if (ratio >= 0.75) return 'text-amber-400';
	return 'text-gray-500';
}

/** Token usage for a single model call. */
export interface TurnUsage {
	inputTokens: number;
	outputTokens: number;
}

/** One completed conversation turn — the unit of multi-turn history. */
export interface ConversationTurn {
	query: string;
	nodeResponses: Partial<Record<MagiNodeName, string>>;
	nodeErrors: Partial<Record<MagiNodeName, string>>;
	consensus: string;
	consensusNode: MagiNodeName;
	nodeUsage: Partial<Record<MagiNodeName, TurnUsage>>;
	consensusUsage?: TurnUsage;
}

/** A completed turn as rendered in a single node panel's transcript. */
export interface NodeTranscriptEntry {
	query: string;
	response: string;
	error: string;
	inputTokens: number;
	outputTokens: number;
}

/** A completed turn as rendered in the consensus transcript. */
export interface ConsensusTranscriptEntry {
	query: string;
	consensus: string;
	inputTokens: number;
	outputTokens: number;
}

export const NODE_COLORS: Record<MagiNodeName, string> = {
	MELCHIOR: 'border-red-500',
	BALTHASAR: 'border-emerald-400',
	CASPAR: 'border-blue-500'
};

export const NODE_HEX_COLORS: Record<MagiNodeName, string> = {
	MELCHIOR: '#ef4444',
	BALTHASAR: '#34d399',
	CASPAR: '#3b82f6'
};

export const CONSENSUS_GRADIENT = `background: linear-gradient(to right, ${MAGI_NODE_NAMES.map((n) => NODE_HEX_COLORS[n]).join(', ')})`;

export const GATEWAY_LABELS: Record<GatewayName, string> = {
	anthropic: 'Anthropic',
	openai: 'OpenAI',
	google: 'Google',
	openrouter: 'OpenRouter'
};

const KNOWN_PROVIDER_LABELS: Record<string, string> = {
	anthropic: 'Anthropic',
	openai: 'OpenAI',
	google: 'Google',
	qwen: 'Qwen',
	nvidia: 'NVIDIA',
	'meta-llama': 'Meta',
	deepseek: 'DeepSeek',
	mistralai: 'Mistral'
};

export function getProviderLabel(provider: string): string {
	return (
		KNOWN_PROVIDER_LABELS[provider] ??
		provider
			.split('-')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ')
	);
}

export function pickDiverseModels(models: AvailableModel[], count: number): AvailableModel[] {
	const picked: AvailableModel[] = [];
	const usedProviders = new Set<string>();
	for (const m of models) {
		if (usedProviders.has(m.provider)) continue;
		picked.push(m);
		usedProviders.add(m.provider);
		if (picked.length >= count) break;
	}
	return picked;
}

export const MAGI_NODES: readonly MagiNode[] = [
	{ name: 'MELCHIOR', temperament: 'rationalist' },
	{ name: 'BALTHASAR', temperament: 'caretaker' },
	{ name: 'CASPAR', temperament: 'individualist' }
];
