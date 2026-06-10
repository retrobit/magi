import type { StrategyName } from './consensus/types';

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

// Hover-explainer text for a temperament badge: the guiding question plus a
// one-line gloss, so users learn the system without consulting the README.
export const TEMPERAMENT_TOOLTIPS: Record<TemperamentName, string> = {
	rationalist:
		'Rationalist — “What do the facts say?” Cold logic and empirical reasoning; data above all.',
	caretaker:
		'Caretaker — “Who does this affect, and how?” Empathy-first; weighs human cost and wellbeing.',
	individualist:
		'Individualist — “What feels true?” Bold conviction and authenticity; the take no one else would give.'
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

/** How a multi-round debate ended. `consensus` — the debaters agree.
 *  `split` — they hold differing positions (stalemate or hit the round limit
 *  still diverging); the synthesizer lays the positions out rather than forcing
 *  a unified answer. `walkover` — only one MAGI responded, so nothing was
 *  debated. Drives which headline banner the consensus panel shows. */
export type DebateVerdict = 'consensus' | 'split' | 'walkover';

/** One debate round as surfaced in a node panel — the trimmed inputs the node
 *  was reacting to and the revised answer it produced. */
export interface DebateRoundEntry {
	round: number;
	/** Trimmed display inputs: this node's prior answer + its anonymized peers'. */
	prompt: string;
	/** The node's revised answer that round. */
	response: string;
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

/** Rough token estimate for streamed text, used to show a live count before
 *  the provider reports exact usage — about four characters per token for
 *  typical English prose. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/** Semantic text-colour class for a context-window usage gauge: red near
 *  full, amber when getting close, neutral otherwise. Returns the magi-*
 *  utilities (not raw Tailwind colours) so both themes stay legible. */
export function contextUsageClass(used: number, window: number | undefined): string {
	const ratio = window ? used / window : 0;
	if (ratio >= 0.9) return 'magi-error';
	if (ratio >= 0.75) return 'magi-warn';
	return 'text-gray-500';
}

/** The hover-tooltip breakdown behind a panel's static-width token gauge: an
 *  optional context line, then ↑in · ↓out · total (· ⚡cached). Shared so the
 *  node panels and the consensus panel read identically. */
export function tokenUsageTooltip(opts: {
	contextUsed: number;
	contextWindow: number | undefined;
	totalInput: number;
	totalOutput: number;
	totalCached: number;
}): string {
	const { contextUsed, contextWindow, totalInput, totalOutput, totalCached } = opts;
	const segs: string[] = [];
	if (contextWindow && contextUsed > 0) {
		segs.push(`Context ${contextUsed.toLocaleString()} / ${contextWindow.toLocaleString()} tokens`);
	}
	if (totalInput > 0 || totalOutput > 0) {
		const t = [
			`↑ ${totalInput.toLocaleString()} in`,
			`↓ ${totalOutput.toLocaleString()} out`,
			`${(totalInput + totalOutput).toLocaleString()} total`
		];
		if (totalCached > 0) t.push(`⚡ ${totalCached.toLocaleString()} cached`);
		segs.push(t.join(' · '));
	}
	return segs.join('  —  ');
}

/** How a panel reacts to streamed content. `off` — never moves. `follow` —
 *  pins to the newest text while scrolled to the bottom. `snap` — jumps to the
 *  start of the latest response once that response finishes. */
export type ScrollMode = 'off' | 'follow' | 'snap';

/** Background flavors selectable in Settings. Single source of truth for the
 *  union consumed by the component, the header, page state, and the
 *  persistence schema. */
export const BG_VARIANTS = ['columns', 'orbs', 'hex', 'off'] as const;
export type BgVariant = (typeof BG_VARIANTS)[number];

/** Token usage for a single model call. `cachedTokens` is the slice of
 *  `inputTokens` served from a prompt cache — present only for gateways that
 *  report it (Anthropic, OpenAI). Optional for back-compat with persisted turns. */
export interface TurnUsage {
	inputTokens: number;
	outputTokens: number;
	cachedTokens?: number;
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
	/** Which consensus strategy produced this turn — drives the debate banner etc. */
	strategy?: StrategyName;
	/** Whether a debate ended in agreement or a split — picks the banner variant. */
	debateVerdict?: DebateVerdict;
	/** A split's coalition shape (e.g. "X & Y aligned; Z dissents") — banner subtitle. */
	debateSummary?: string;
	/** Debate rounds per node (Multi-Round Debate only) — kept so the round-by-round
	 *  detail survives in the transcript after the turn completes. */
	debateRounds?: Partial<Record<MagiNodeName, DebateRoundEntry[]>>;
}

/** A completed turn as rendered in a single node panel's transcript. */
export interface NodeTranscriptEntry {
	query: string;
	response: string;
	error: string;
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	/** This node's debate rounds for the turn, if any. */
	debateRounds?: DebateRoundEntry[];
}

/** A completed turn as rendered in the consensus transcript. */
export interface ConsensusTranscriptEntry {
	query: string;
	consensus: string;
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	/** Strategy that produced this turn — shows the debate banner in the transcript. */
	strategy?: StrategyName;
	/** Debate outcome — picks the consensus/split banner variant in the transcript. */
	debateVerdict?: DebateVerdict;
	/** A split's coalition shape — banner subtitle in the transcript. */
	debateSummary?: string;
}

export const NODE_COLORS: Record<MagiNodeName, string> = {
	MELCHIOR: 'border-red-500',
	BALTHASAR: 'border-emerald-400',
	CASPAR: 'border-blue-500'
};

/** Node identity hex triad. CSS consumers read the --magi-node-* variables in
 *  layout.css instead — keep the two in lockstep when retuning. This map stays
 *  for JS call sites that need a literal (inline style:--node-color, debug
 *  swatches). */
export const NODE_HEX_COLORS: Record<MagiNodeName, string> = {
	MELCHIOR: '#ef4444',
	BALTHASAR: '#34d399',
	CASPAR: '#3b82f6'
};

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
