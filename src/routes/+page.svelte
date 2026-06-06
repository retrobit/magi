<script lang="ts">
	import MagiBackground from '$lib/components/MagiBackground.svelte';
	import TierSelector from '$lib/components/TierSelector.svelte';
	import MagiPanel from '$lib/components/MagiPanel.svelte';
	import ConsensusView from '$lib/components/ConsensusView.svelte';
	import LayoutToggle from '$lib/components/LayoutToggle.svelte';
	import MagiHeader from '$lib/components/MagiHeader.svelte';
	import TokenCount from '$lib/components/TokenCount.svelte';
	import { appendRunStat } from '$lib/magi/run-stats';
	import { tooltip } from '$lib/actions/tooltip';
	import {
		freshDebugScenario,
		isDebugScenarioActive,
		type DebugScenario,
		type ContextLevel
	} from '$lib/components/DebugPanel.svelte';
	import { TIER_CONFIGS, buildDiverseConfig, type NodeAssignment } from '$lib/magi/config';
	import {
		DEFAULT_TIER,
		MAGI_NODE_NAMES,
		NODE_LABELS,
		NODE_LABELS_GENERIC,
		NODE_TEMPERAMENTS,
		estimateTokens,
		type TierName,
		type MagiNodeName,
		type GatewayName,
		type AvailableModel,
		type MagiResponse,
		type ConversationTurn,
		type TurnUsage,
		type NodeTranscriptEntry,
		type ConsensusTranscriptEntry,
		type DebateRoundEntry,
		type DebateVerdict,
		type ScrollMode
	} from '$lib/magi/types';
	import { getModelsForTier, findModelEntry } from '$lib/magi/registry';
	import { DEFAULT_STRATEGY, type StrategyName } from '$lib/magi/consensus';
	import type { StreamEventName, StreamEventPayloads } from '$lib/magi/stream-events';
	import {
		loadPrefs,
		savePrefs,
		loadConversations,
		saveConversations,
		type PersistedSnapshot,
		type PersistedSettings
	} from '$lib/magi/persistence';
	import { onMount, onDestroy } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		Triangle,
		LoaderCircle,
		CircleAlert,
		AlertTriangle,
		ArrowLeftRight,
		X,
		Brain,
		Copy,
		Check,
		MessageSquarePlus
	} from 'lucide-svelte';

	interface MagiModelError {
		node: MagiNodeName;
		gateway: GatewayName;
		provider: string;
		error: string;
	}

	const RANDOM_PROMPTS = [
		'What is consciousness?',
		'Is mathematics discovered or invented?',
		'What will be the most important technology in 2050?',
		'Is free will an illusion?',
		'Should AI systems have rights?',
		'What is the hardest problem in science right now?',
		"Explain quantum entanglement like I'm ten years old",
		'What would a perfect education system look like?',
		'Are humans fundamentally good or fundamentally selfish?',
		'What is the most underrated invention in history?',
		'If you could send one message to every human on Earth, what would it be?',
		'What is the strongest argument against your own existence?',
		'Why do we dream?',
		'What would first contact with an alien civilization actually look like?',
		'Is there a limit to what science can explain?'
	];

	// A node/consensus warns once its latest prompt crosses this share of the
	// model's context window.
	const CONTEXT_WARN_RATIO = 0.75;

	let tier: TierName = $state(DEFAULT_TIER);
	let strategy: StrategyName = $state(DEFAULT_STRATEGY);
	let temperaments = $state(false);
	let genericLabels = $state(true);
	let query = $state('');
	let loading = $state(false);
	let configuredNodes = new SvelteSet([0, 1, 2]);
	let consensusNode: MagiNodeName = $state('MELCHIOR');
	let availableModels = $state<AvailableModel[]>([]);
	let modelsLoading = $state(true);
	let copiedQuery = $state(false);
	let consensusTemperament = $state(false);
	let temperamentAwareness = $state(false);
	let bgVariant = $state<'columns' | 'orbs' | 'off'>('orbs');
	let theme = $state<'dark' | 'light'>('dark');
	let scrollMode = $state<ScrollMode>('snap');
	// Focus accordion between the node row and the consensus. The status-bar layout
	// control sets one of three states: nodes expanded, consensus expanded, or a
	// balanced split (the default — both zones share the view so neither buries
	// the other before the user has decided where to focus).
	let layoutFocus = $state<'balanced' | 'nodes' | 'consensus'>('balanced');
	const nodesCollapsed = $derived(layoutFocus === 'consensus');
	const consensusCollapsed = $derived(layoutFocus === 'nodes');
	const setLayoutFocus = (focus: 'balanced' | 'nodes' | 'consensus') => (layoutFocus = focus);
	// Each header's click advances through all three layout states, leading
	// with that zone first: clicking a node header goes balanced → nodes →
	// consensus → balanced, and clicking the consensus header mirrors it.
	function cycleLayout(prefer: 'nodes' | 'consensus') {
		const other = prefer === 'nodes' ? 'consensus' : 'nodes';
		layoutFocus = layoutFocus === 'balanced' ? prefer : layoutFocus === prefer ? other : 'balanced';
	}
	// Status-bar click has no zone preference — it just advances through the
	// cycle in a fixed order. Filter out clicks that landed on a button or
	// other interactive descendant (New Conversation, LayoutToggle segments)
	// so the existing controls still work.
	function advanceLayout() {
		layoutFocus =
			layoutFocus === 'balanced' ? 'nodes' : layoutFocus === 'nodes' ? 'consensus' : 'balanced';
	}
	function isControlClick(e: Event): boolean {
		const t = e.target;
		return t instanceof HTMLElement && !!t.closest('button, select, a, input, textarea');
	}
	function onStatusBarClick(e: MouseEvent) {
		if (isControlClick(e)) return;
		advanceLayout();
	}
	function onStatusBarKeydown(e: KeyboardEvent) {
		if (e.target !== e.currentTarget) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			advanceLayout();
		}
	}
	let debugScenario = $state<DebugScenario>(freshDebugScenario());
	// Bumped each time a fresh `run-stats` event lands, so the panel re-reads
	// localStorage without us having to thread the record list through props.
	let statsNonce = $state(0);

	// Multi-turn conversation — completed turns for the active tier, plus the
	// in-flight turn's query and streaming token usage.
	let conversation = $state<ConversationTurn[]>([]);
	let activeTurnQuery = $state('');
	let liveNodeUsage = $state<Partial<Record<MagiNodeName, TurnUsage>>>({});
	let liveConsensusUsage = $state<TurnUsage | undefined>(undefined);

	function copyQuery() {
		navigator.clipboard.writeText(query).catch(() => {});
		copiedQuery = true;
		setTimeout(() => (copiedQuery = false), 1500);
	}

	let assignments = $state<[NodeAssignment, NodeAssignment, NodeAssignment]>(
		// Placeholder — will be replaced once models are fetched for free tier,
		// or immediately populated from TIER_CONFIGS for paid tiers
		[...TIER_CONFIGS.balanced] as [NodeAssignment, NodeAssignment, NodeAssignment]
	);

	// The in-flight turn's streaming state — every field reset between turns.
	interface LiveState {
		responses: MagiResponse[];
		modelStreams: Record<MagiNodeName, string>;
		modelErrors: MagiModelError[];
		// Debate rounds surfaced per node — appended live as each round resolves.
		debateRounds: Record<MagiNodeName, DebateRoundEntry[]>;
		consensusStream: string;
		consensusFinal: string;
		// Debate outcome, set on the consensus-complete event — picks the banner variant.
		debateVerdict?: DebateVerdict;
		// A split's coalition shape (e.g. "X & Y aligned; Z dissents") — banner subtitle.
		debateSummary?: string;
		consensusWarning: string;
		error: string;
		streamDone: boolean;
		// Dev-only: when true, drive the pending UI (sweeping verb + glow) without a
		// real fetch in flight. Set by the debug panel's Load toggles; treated as an
		// additional source of `loading` everywhere the UI checks it.
		debugPreviewLoading: boolean;
	}

	function freshLiveState(): LiveState {
		return {
			responses: [],
			modelStreams: { MELCHIOR: '', BALTHASAR: '', CASPAR: '' },
			modelErrors: [],
			debateRounds: { MELCHIOR: [], BALTHASAR: [], CASPAR: [] },
			consensusStream: '',
			consensusFinal: '',
			consensusWarning: '',
			error: '',
			streamDone: false,
			debugPreviewLoading: false
		};
	}

	interface TierSnapshot {
		live: LiveState;
		assignments: [NodeAssignment, NodeAssignment, NodeAssignment];
		configuredNodes: Set<number>;
		consensusNode: MagiNodeName;
		conversation: ConversationTurn[];
	}

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive cache, never triggers UI updates
	const tierCache = new Map<TierName, TierSnapshot>();

	// Per-tier config hydrated from localStorage on mount. `prefsHydrated` gates
	// the persistence effect so it can't overwrite storage before the load runs.
	let persistedSnapshots: Partial<Record<TierName, PersistedSnapshot>> = {};
	let conversationsByTier: Partial<Record<TierName, ConversationTurn[]>> = {};
	let prefsHydrated = false;

	// All in-flight streaming state, grouped so a turn reset or tier snapshot is
	// one assignment rather than eight.
	let live = $state<LiveState>(freshLiveState());
	let abortController: AbortController | null = null;

	type NodeStatus = 'idle' | 'pending' | 'success' | 'error' | 'unknown';

	const responseMap = $derived(new Map(live.responses.map((r) => [r.node, r])));
	const errorMap = $derived(new Map(live.modelErrors.map((e) => [e.node, e.error])));
	const allModelsResponded = $derived(live.responses.length + live.modelErrors.length >= 3);

	const consensusAssignment = $derived(
		assignments.find((a) => a.node === consensusNode) ?? assignments[0]
	);

	// Live output tokens: exact once the usage event lands, otherwise an estimate
	// from the streamed text so the count climbs live. Errored nodes report none.
	const liveNodeOutputs = $derived.by(() => {
		const out = {} as Record<MagiNodeName, { tokens: number; estimated: boolean }>;
		for (const node of MAGI_NODE_NAMES) {
			const exact = liveNodeUsage[node];
			if (exact) {
				out[node] = { tokens: exact.outputTokens, estimated: false };
			} else if (errorMap.has(node)) {
				out[node] = { tokens: 0, estimated: false };
			} else {
				const text = live.modelStreams[node];
				out[node] = { tokens: estimateTokens(text), estimated: text.length > 0 };
			}
		}
		return out;
	});

	const liveConsensusOutput = $derived.by(() => {
		if (liveConsensusUsage) {
			return { tokens: liveConsensusUsage.outputTokens, estimated: false };
		}
		const text = live.consensusStream;
		return { tokens: estimateTokens(text), estimated: text.length > 0 };
	});

	// Cumulative token usage across the conversation, including the in-flight
	// turn so the running total climbs live.
	const conversationUsage = $derived.by(() => {
		let input = 0;
		let output = 0;
		for (const turn of conversation) {
			for (const node of MAGI_NODE_NAMES) {
				const u = turn.nodeUsage[node];
				if (u) {
					input += u.inputTokens;
					output += u.outputTokens;
				}
			}
			if (turn.consensusUsage) {
				input += turn.consensusUsage.inputTokens;
				output += turn.consensusUsage.outputTokens;
			}
		}
		for (const node of MAGI_NODE_NAMES) {
			input += liveNodeUsage[node]?.inputTokens ?? 0;
			output += liveNodeOutputs[node].tokens;
		}
		input += liveConsensusUsage?.inputTokens ?? 0;
		output += liveConsensusOutput.tokens;
		return { input, output, total: input + output };
	});

	const conversationEstimated = $derived(
		MAGI_NODE_NAMES.some((n) => liveNodeOutputs[n].estimated) || liveConsensusOutput.estimated
	);

	// Explainer for the header's running token total — mirrors the per-panel
	// readouts: ↑ prompt tokens in, ↓ generated tokens out, combined total, summed
	// across every node and the consensus over the whole conversation.
	const conversationTokensTooltip = $derived(
		`Tokens this conversation (all nodes + consensus) — ↑ ${conversationUsage.input.toLocaleString()} in · ↓ ${conversationUsage.output.toLocaleString()} out · ${conversationUsage.total.toLocaleString()} total${conversationEstimated ? ' · live estimate' : ''}`
	);

	function modelContextWindow(modelId: string): number | undefined {
		return availableModels.find((m) => m.id === modelId)?.contextLength;
	}

	// The most recent prompt size for a node — live turn if streaming, else the
	// last completed turn. Tracks how full that model's context is running.
	function latestNodeInput(node: MagiNodeName): number {
		const usage = liveNodeUsage[node];
		if (usage) return usage.inputTokens;
		for (let i = conversation.length - 1; i >= 0; i--) {
			const u = conversation[i].nodeUsage[node];
			if (u) return u.inputTokens;
		}
		return 0;
	}

	function latestConsensusInput(): number {
		if (liveConsensusUsage) return liveConsensusUsage.inputTokens;
		for (let i = conversation.length - 1; i >= 0; i--) {
			const u = conversation[i].consensusUsage;
			if (u) return u.inputTokens;
		}
		return 0;
	}

	// Nodes / consensus whose latest prompt is nearing their model's window.
	const contextWarnings = $derived.by(() => {
		const names: (MagiNodeName | 'consensus')[] = [];
		for (const a of assignments) {
			const win = modelContextWindow(a.modelId);
			if (win && latestNodeInput(a.node) / win >= CONTEXT_WARN_RATIO) names.push(a.node);
		}
		const cWin = modelContextWindow(consensusAssignment.modelId);
		if (cWin && latestConsensusInput() / cWin >= CONTEXT_WARN_RATIO) names.push('consensus');
		return names;
	});

	// Names each near-limit seat with the label the UI is currently showing —
	// EVA names or generic MAGI numbers — rather than the raw node key.
	const contextWarningLabels = $derived(
		contextWarnings.map((name) =>
			name === 'consensus' ? 'Consensus' : (genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS)[name]
		)
	);

	// Per-node transcripts — one entry per completed turn, for each node. Derived
	// once from `conversation` so streaming chunks don't rebuild all three.
	const nodeTranscripts = $derived.by(() => {
		const byNode = {} as Record<MagiNodeName, NodeTranscriptEntry[]>;
		for (const node of MAGI_NODE_NAMES) byNode[node] = buildNodeTranscript(node);
		return byNode;
	});

	function buildNodeTranscript(node: MagiNodeName): NodeTranscriptEntry[] {
		return conversation.map((turn) => {
			const u = turn.nodeUsage[node];
			return {
				query: turn.query,
				response: turn.nodeResponses[node] ?? '',
				error: turn.nodeErrors[node] ?? '',
				inputTokens: u?.inputTokens ?? 0,
				outputTokens: u?.outputTokens ?? 0,
				cachedTokens: u?.cachedTokens ?? 0,
				debateRounds: turn.debateRounds?.[node] ?? []
			};
		});
	}

	const consensusTranscript: ConsensusTranscriptEntry[] = $derived(
		conversation.map((turn) => ({
			query: turn.query,
			consensus: turn.consensus,
			inputTokens: turn.consensusUsage?.inputTokens ?? 0,
			outputTokens: turn.consensusUsage?.outputTokens ?? 0,
			cachedTokens: turn.consensusUsage?.cachedTokens ?? 0,
			strategy: turn.strategy,
			debateVerdict: turn.debateVerdict,
			debateSummary: turn.debateSummary
		}))
	);

	// Effective loading flag: union of the real fetch-in-flight `loading` state and
	// the debug panel's preview flag, so the pending UI (verb sweeps, glow,
	// consensus loader) lights up the same whether the data is real or injected.
	const effectiveLoading = $derived(loading || live.debugPreviewLoading);

	function getNodeStatus(node: MagiNodeName): NodeStatus {
		if (errorMap.get(node)) return 'error';
		if (responseMap.get(node)) return 'success';
		if (effectiveLoading && !live.streamDone) return 'pending';
		if (effectiveLoading && live.streamDone) return 'unknown';
		// Turn finished and live state was cleared — keep the last turn's outcome so
		// the checkmark persists instead of reverting to idle. Long debates make the
		// reset-to-idle especially noticeable.
		if (conversation.length > 0) {
			const last = conversation[conversation.length - 1];
			if (last.nodeErrors[node]) return 'error';
			if (last.nodeResponses[node]) return 'success';
		}
		return 'idle';
	}

	function getModelDisplayName(assignment: NodeAssignment): string {
		// Check static registry first, then dynamic models
		const entry = findModelEntry(assignment.gateway, assignment.modelId);
		if (entry) return entry.displayName;
		const dynamic = availableModels.find((m) => m.id === assignment.modelId);
		return dynamic?.displayName ?? assignment.modelId;
	}

	function getStaticModels(t: TierName): AvailableModel[] {
		return getModelsForTier(t).map((m) => ({
			id: m.id,
			gateway: m.gateway,
			provider: m.provider,
			displayName: m.displayName,
			contextLength: m.contextLength
		}));
	}

	function applyTierDefaults(t: TierName) {
		if (t === 'free') {
			assignments = buildDiverseConfig(availableModels) as [
				NodeAssignment,
				NodeAssignment,
				NodeAssignment
			];
		} else {
			assignments = [...TIER_CONFIGS[t]] as [NodeAssignment, NodeAssignment, NodeAssignment];
		}
		configuredNodes.clear();
		configuredNodes.add(0);
		configuredNodes.add(1);
		configuredNodes.add(2);
		consensusNode = 'MELCHIOR';
	}

	function applyPersistedSnapshot(snap: PersistedSnapshot) {
		assignments = snap.assignments.map((a) => ({ ...a })) as [
			NodeAssignment,
			NodeAssignment,
			NodeAssignment
		];
		configuredNodes.clear();
		for (const i of snap.configuredNodes) configuredNodes.add(i);
		consensusNode = snap.consensusNode;
	}

	// Restore the global (not per-tier) UI settings saved from a previous visit.
	function applyPersistedSettings(s: PersistedSettings) {
		strategy = s.strategy;
		temperaments = s.temperaments;
		consensusTemperament = s.consensusTemperament;
		temperamentAwareness = s.temperamentAwareness;
		genericLabels = s.genericLabels;
		theme = s.theme;
		bgVariant = s.bgVariant;
		scrollMode = s.scrollMode;
		if (s.layoutFocus) layoutFocus = s.layoutFocus;
	}

	// A persisted snapshot is usable only if every model it names still exists.
	// Paid tiers draw from the static registry (stable); the free tier's
	// OpenRouter models rotate, so each saved model must still be on offer.
	function persistedSnapshotUsable(
		snap: PersistedSnapshot,
		t: TierName,
		models: AvailableModel[]
	): boolean {
		if (t !== 'free') return true;
		const ids = new Set(models.map((m) => m.id));
		return snap.assignments.every((a) => ids.has(a.modelId));
	}

	async function fetchModels(t: TierName) {
		modelsLoading = true;
		try {
			if (t === 'free') {
				const res = await fetch(`/api/magi/models?tier=${t}`);
				const data = (await res.json()) as { models: AvailableModel[] };
				availableModels = data.models;
			} else {
				availableModels = getStaticModels(t);
			}

			// No in-session snapshot: restore the saved per-tier config when we
			// have a usable one, else fall back to this tier's default assignments.
			if (!tierCache.has(t) && availableModels.length >= 3) {
				const persisted = persistedSnapshots[t];
				if (persisted && persistedSnapshotUsable(persisted, t, availableModels)) {
					applyPersistedSnapshot(persisted);
				} else {
					applyTierDefaults(t);
				}
			}
		} catch {
			if (t !== 'free') {
				availableModels = getStaticModels(t);
			}
		}
		modelsLoading = false;
	}

	onMount(async () => {
		const prefs = loadPrefs();
		if (prefs) {
			persistedSnapshots = prefs.snapshots;
			tier = prefs.tier;
			if (prefs.settings) applyPersistedSettings(prefs.settings);
		}
		conversationsByTier = loadConversations();
		conversation = conversationsByTier[tier] ?? [];
		await fetchModels(tier);
		prefsHydrated = true;
	});

	// Persist the active tier and its per-node config on every change. Each tier
	// keeps its own snapshot, so switching tiers never discards saved selections.
	$effect(() => {
		const activeTier = tier;
		const snap: PersistedSnapshot = {
			assignments: assignments.map((a) => ({ ...a })),
			configuredNodes: [...configuredNodes],
			consensusNode
		};
		const settings: PersistedSettings = {
			strategy,
			temperaments,
			consensusTemperament,
			temperamentAwareness,
			genericLabels,
			theme,
			bgVariant,
			scrollMode,
			layoutFocus
		};
		if (!prefsHydrated) return;
		persistedSnapshots[activeTier] = snap;
		savePrefs({ tier: activeTier, snapshots: persistedSnapshots, settings });
	});

	// Persist the active tier's conversation thread on every change.
	$effect(() => {
		const activeTier = tier;
		const turns = conversation.map((t) => ({ ...t }));
		if (!prefsHydrated) return;
		conversationsByTier[activeTier] = turns;
		saveConversations(conversationsByTier);
	});

	// The query form collapses to an icon-only button under the `sm` breakpoint;
	// `compact` tracks that so the input placeholder can shorten to match.
	let compact = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(max-width: 639.98px)');
		const sync = () => (compact = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	const queryPlaceholder = $derived(
		compact
			? 'Ask the MAGI system... or click "▶"'
			: 'Ask the MAGI system... or click "▶ Execute" for a random prompt'
	);

	// Capture and restore the full per-tier snapshot. Kept as a symmetric
	// pair so a new field is added to both sides at once, not threaded
	// through twelve scattered assignments.
	function captureTierSnapshot(): TierSnapshot {
		return {
			live: $state.snapshot(live),
			assignments: [...assignments] as [NodeAssignment, NodeAssignment, NodeAssignment],
			configuredNodes: new Set(configuredNodes),
			consensusNode,
			conversation: [...conversation]
		};
	}

	function applyTierSnapshot(snap: TierSnapshot) {
		// Clone so streaming into the restored tier can't mutate the cache entry.
		live = structuredClone(snap.live);
		assignments = [...snap.assignments] as [NodeAssignment, NodeAssignment, NodeAssignment];
		configuredNodes.clear();
		for (const v of snap.configuredNodes) configuredNodes.add(v);
		consensusNode = snap.consensusNode;
		conversation = snap.conversation;
	}

	function saveTierSnapshot() {
		tierCache.set(tier, captureTierSnapshot());
	}

	function loadTierSnapshot(t: TierName) {
		const cached = tierCache.get(t);
		if (cached) {
			applyTierSnapshot(cached);
		} else {
			resetLiveState();
			configuredNodes.clear();
			configuredNodes.add(0);
			configuredNodes.add(1);
			configuredNodes.add(2);
			consensusNode = 'MELCHIOR';
			conversation = conversationsByTier[t] ?? [];
		}
		activeTurnQuery = '';
		liveNodeUsage = {};
		liveConsensusUsage = undefined;
	}

	function handleTierChange(newTier: TierName) {
		if (newTier === tier || loading) return;
		saveTierSnapshot();
		tier = newTier;
		loadTierSnapshot(newTier);
		fetchModels(newTier);
	}

	function getUsedProviders(excludeIndex: number): string[] {
		return assignments
			.filter((_, i) => i !== excludeIndex && configuredNodes.has(i))
			.map((a) => a.provider);
	}

	function handleNodeChange(
		nodeIndex: number,
		gateway: GatewayName,
		provider: string,
		modelId: string
	) {
		configuredNodes.add(nodeIndex);
		const node = MAGI_NODE_NAMES[nodeIndex];
		assignments[nodeIndex] = { node, gateway, provider, modelId };
	}

	const allConfigured = $derived(configuredNodes.size === 3);

	function handleSwap(a: number, b: number) {
		const { node: nodeA, ...restA } = assignments[a];
		const { node: nodeB, ...restB } = assignments[b];
		assignments[a] = { node: nodeA, ...restB };
		assignments[b] = { node: nodeB, ...restA };
	}

	// Replay completed turns as request history (own-thread context per node).
	function buildHistory() {
		return conversation.map((turn) => ({
			query: turn.query,
			nodeResponses: MAGI_NODE_NAMES.filter((n) => turn.nodeResponses[n] !== undefined).map(
				(n) => ({ node: n, text: turn.nodeResponses[n] as string })
			),
			consensus: turn.consensus
		}));
	}

	// Clear the in-flight turn's streaming state and live token usage. Does not
	// touch the committed `conversation` thread.
	function resetLiveState() {
		live = freshLiveState();
		liveNodeUsage = {};
		liveConsensusUsage = undefined;
	}

	// --- Dev debug panel -----------------------------------------------------
	// Injects synthetic error / context-limit UI states straight into the live
	// turn, so those states can be exercised without making a real model call.
	const DEBUG_QUERY = '[debug] UI state inspection';
	const DEBUG_RESPONSE =
		'Debug placeholder response — injected by the dev debug panel, no model was called.';
	const DEBUG_CONSENSUS =
		'Debug placeholder consensus — injected by the dev debug panel, no model was called.';
	const DEBUG_NODE_ERROR = 'Debug: injected model failure (no real request was made).';
	const DEBUG_GLOBAL_ERROR = 'Debug: injected global error banner.';
	const DEBUG_PARTIAL = 'Only 2 of 3 models responded — consensus is based on partial data.';

	// Token count that drives a model's context gauge into the requested band.
	function debugContextTokens(modelId: string, level: ContextLevel): number {
		const window = modelContextWindow(modelId) ?? 128_000;
		const ratio = level === 'critical' ? 0.95 : level === 'warn' ? 0.8 : 0.1;
		return Math.round(window * ratio);
	}

	function applyDebugScenario(scenario: DebugScenario) {
		if (loading) return;
		if (!isDebugScenarioActive(scenario)) {
			activeTurnQuery = '';
			resetLiveState();
			return;
		}
		const next = freshLiveState();
		const usage: Partial<Record<MagiNodeName, TurnUsage>> = {};
		for (const a of assignments) {
			if (scenario.nodeError[a.node]) {
				next.modelErrors.push({
					node: a.node,
					gateway: a.gateway,
					provider: a.provider,
					error: DEBUG_NODE_ERROR
				});
			} else if (scenario.nodeLoading[a.node]) {
				// Pending: leave the node empty so getNodeStatus reports 'pending'.
				// No usage either — there's nothing to bill against an in-flight call.
			} else {
				next.responses.push({
					node: a.node,
					gateway: a.gateway,
					provider: a.provider,
					text: DEBUG_RESPONSE
				});
				usage[a.node] = {
					inputTokens: debugContextTokens(a.modelId, scenario.nodeContext[a.node]),
					outputTokens: 320,
					cachedTokens: 0
				};
			}
		}
		next.error = scenario.globalError ? DEBUG_GLOBAL_ERROR : '';
		next.consensusWarning = scenario.partialConsensus ? DEBUG_PARTIAL : '';
		// Any Load toggle drives the union pending UI (verb sweeps, glow, consensus
		// loader). When it's on, the consensus text stays empty so the loader fires
		// (`loading && allModelsResponded && !text`) and streamDone goes false so
		// nodes without a response read as 'pending', not 'unknown'.
		const previewLoading =
			scenario.consensusLoading || MAGI_NODE_NAMES.some((n) => scenario.nodeLoading[n]);
		next.debugPreviewLoading = previewLoading;
		next.streamDone = !previewLoading;
		if (scenario.consensusLoading) {
			next.consensusStream = '';
			next.consensusFinal = '';
		} else {
			next.consensusStream = DEBUG_CONSENSUS;
			next.consensusFinal = DEBUG_CONSENSUS;
		}
		activeTurnQuery = DEBUG_QUERY;
		live = next;
		liveNodeUsage = usage;
		liveConsensusUsage = scenario.consensusLoading
			? undefined
			: {
					inputTokens: debugContextTokens(consensusAssignment.modelId, scenario.consensusContext),
					outputTokens: 480,
					cachedTokens: 0
				};
	}

	// Commit the just-finished turn into the conversation, then clear live state.
	function finalizeTurn() {
		if (!activeTurnQuery) return;
		const hasContent =
			live.responses.length > 0 ||
			live.modelErrors.length > 0 ||
			live.consensusFinal !== '' ||
			live.consensusStream !== '';
		if (!hasContent) {
			// Aborted or hard-failed before anything usable arrived — record no turn.
			activeTurnQuery = '';
			return;
		}
		const nodeResponses: Partial<Record<MagiNodeName, string>> = {};
		const nodeErrors: Partial<Record<MagiNodeName, string>> = {};
		for (const r of live.responses) nodeResponses[r.node] = r.text;
		for (const e of live.modelErrors) nodeErrors[e.node] = e.error;
		conversation = [
			...conversation,
			{
				query: activeTurnQuery,
				nodeResponses,
				nodeErrors,
				consensus: live.consensusFinal || live.consensusStream,
				consensusNode,
				nodeUsage: { ...liveNodeUsage },
				consensusUsage: liveConsensusUsage,
				strategy,
				debateVerdict: live.debateVerdict,
				debateSummary: live.debateSummary,
				debateRounds: { ...live.debateRounds }
			}
		];
		// Live-turn state now belongs to the committed turn — reset it.
		activeTurnQuery = '';
		resetLiveState();
	}

	function handleNewConversation() {
		if (loading) return;
		conversation = [];
		activeTurnQuery = '';
		debugScenario = freshDebugScenario();
		resetLiveState();
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading || !allConfigured) return;
		debugScenario = freshDebugScenario();

		const turnQuery =
			query.trim() || RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
		query = '';
		activeTurnQuery = turnQuery;

		abortController?.abort();
		abortController = new AbortController();

		loading = true;
		resetLiveState();

		try {
			const res = await fetch('/api/magi', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: turnQuery,
					tier,
					strategy,
					consensusNode,
					assignments,
					temperaments,
					consensusTemperament,
					temperamentAwareness,
					genericLabels,
					history: buildHistory()
				}),
				signal: abortController.signal
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({ error: 'Request failed' }));
				live.error = data.error ?? `Request failed (${res.status})`;
			} else {
				const reader = res.body!.getReader();
				const decoder = new TextDecoder();
				let buffer = '';

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const parts = buffer.split('\n\n');
					buffer = parts.pop() ?? '';

					for (const part of parts) {
						let event = '';
						let data = '';
						for (const line of part.split('\n')) {
							if (line.startsWith('event: ')) event = line.slice(7);
							else if (line.startsWith('data: ')) data = line.slice(6);
						}
						if (event && data) {
							try {
								handleEvent(event, JSON.parse(data));
							} catch {
								// Malformed SSE data — skip silently
							}
						}
					}
				}
			}
		} catch (err) {
			if (!(err instanceof DOMException && err.name === 'AbortError')) {
				live.error = err instanceof Error ? err.message : 'Network error';
			}
		}

		live.streamDone = true;
		loading = false;
		finalizeTurn();
	}

	// One handler per SSE event. The map is keyed by `StreamEventName`, so the
	// set of events stays in lockstep with the server's payload contract.
	const streamEventHandlers: {
		[E in StreamEventName]: (data: StreamEventPayloads[E]) => void;
	} = {
		config: (data) => {
			assignments = [...data] as [NodeAssignment, NodeAssignment, NodeAssignment];
		},
		'model-chunk': ({ node, text }) => {
			if (node in live.modelStreams) live.modelStreams[node] += text;
		},
		'node-round': ({ node, entry }) => {
			if (node in live.debateRounds) live.debateRounds[node] = [...live.debateRounds[node], entry];
		},
		'model-response': (data) => {
			live.responses = [...live.responses, data];
		},
		'model-error': (data) => {
			live.modelErrors = [...live.modelErrors, data];
		},
		'consensus-chunk': ({ text }) => {
			live.consensusStream += text;
		},
		'consensus-complete': ({ text, debateVerdict, debateSummary }) => {
			live.consensusFinal = text;
			live.debateVerdict = debateVerdict;
			live.debateSummary = debateSummary;
		},
		'partial-consensus': ({ responded, total }) => {
			live.consensusWarning = `Only ${responded} of ${total} models responded — consensus is based on partial data.`;
		},
		'model-usage': ({ node, inputTokens, outputTokens, cachedInputTokens }) => {
			if (node in live.modelStreams)
				liveNodeUsage[node] = { inputTokens, outputTokens, cachedTokens: cachedInputTokens };
		},
		'consensus-usage': ({ inputTokens, outputTokens, cachedInputTokens }) => {
			liveConsensusUsage = { inputTokens, outputTokens, cachedTokens: cachedInputTokens };
		},
		'run-stats': (data) => {
			// Per-run telemetry — accumulates usage axes for every run plus voting
			// metrics, so the 📊 STATS panel can surface long-running patterns.
			appendRunStat(data);
			statsNonce += 1;
		},
		error: ({ message }) => {
			live.error = message;
		}
	};

	function handleEvent(event: string, data: unknown) {
		const handler = streamEventHandlers[event as StreamEventName];
		if (handler) handler(data as never);
	}

	onDestroy(() => abortController?.abort());
</script>

<svelte:head>
	<title>MAGI</title>
</svelte:head>

<div
	class="magi-bg flex h-screen flex-col overflow-y-auto bg-gray-950 text-white {theme === 'light'
		? 'light'
		: ''}"
>
	<MagiBackground variant={bgVariant} />

	<MagiHeader
		bind:theme
		bind:bgVariant
		bind:scrollMode
		{genericLabels}
		{assignments}
		{loading}
		{debugScenario}
		{statsNonce}
		ondebugchange={(next) => {
			debugScenario = next;
			applyDebugScenario(next);
		}}
	/>

	<!-- Control strip -->
	<div class="magi-controls relative z-10 shrink-0 border-b border-gray-800 bg-gray-950/80">
		<div
			class="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-2 sm:flex-row sm:justify-between md:px-6"
		>
			<div class="flex items-center gap-2">
				<span class="text-xs text-gray-500">TIER</span>
				<TierSelector value={tier} onchange={handleTierChange} disabled={loading} />
			</div>
			<div class="flex items-center gap-2">
				<span class="text-xs text-gray-500">TEMPERAMENT</span>
				<button
					type="button"
					onclick={() => (temperaments = !temperaments)}
					disabled={loading}
					class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors {temperaments
						? 'magi-temperament-on bg-gray-600/30 text-gray-200 ring-1 ring-gray-500/50'
						: 'magi-temperament-off bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'} disabled:opacity-50"
					use:tooltip={temperaments
						? 'Temperaments active — each MAGI node answers through its own dispositional lens (Rationalist, Caretaker, Individualist). Click to turn off.'
						: 'Enable temperaments — give each MAGI node a distinct personality: MELCHIOR Rationalist, BALTHASAR Caretaker, CASPAR Individualist. Click to turn on.'}
				>
					<Brain size={12} />
					{temperaments ? 'ON' : 'OFF'}
				</button>
			</div>
		</div>
	</div>

	<!-- Main content -->
	<main class="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 md:min-h-0 md:p-6">
		<!-- Query input -->
		<form onsubmit={handleSubmit} class="flex shrink-0 gap-3">
			<div class="relative flex-1">
				<input
					bind:value={query}
					type="text"
					placeholder={queryPlaceholder}
					disabled={loading}
					class="magi-input w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 pr-10 text-ellipsis whitespace-nowrap text-white placeholder-gray-500 focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none"
				/>
				{#if query.trim()}
					<button
						type="button"
						class="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 transition-colors hover:text-white"
						onclick={copyQuery}
						title="Copy prompt"
					>
						{#if copiedQuery}
							<Check size={14} class="text-green-400" />
						{:else}
							<Copy size={14} />
						{/if}
					</button>
				{/if}
			</div>
			{#if loading}
				<button
					type="button"
					onclick={() => abortController?.abort()}
					aria-label="Abort"
					class="magi-btn group flex w-12 items-center justify-center gap-2 rounded-lg bg-gray-600 py-3 font-medium text-white transition-colors hover:bg-red-600 sm:w-40"
				>
					<span class="flex items-center gap-2 group-hover:hidden">
						<LoaderCircle size={16} class="animate-spin" />
						<span class="hidden sm:inline">Processing...</span>
					</span>
					<span class="hidden items-center gap-2 group-hover:flex">
						<X size={16} />
						<span class="hidden sm:inline">Abort</span>
					</span>
				</button>
			{:else}
				<button
					type="submit"
					disabled={!allConfigured || modelsLoading}
					aria-label="Execute"
					class="magi-btn flex w-12 items-center justify-center gap-2 rounded-lg bg-gray-600 py-3 font-medium text-white transition-colors hover:bg-gray-500 disabled:opacity-50 disabled:hover:bg-gray-600 sm:w-40"
				>
					<Triangle size={14} class="rotate-90 fill-current" />
					<span class="hidden sm:inline">Execute</span>
				</button>
			{/if}
		</form>

		<!-- Conversation status bar — always rendered (even before the first
		     prompt) so submitting a query doesn't reflow the layout. At sm+, a
		     1fr/auto/1fr grid pins the layout toggle to true center: the side
		     cells absorb growth on either side (counters lengthen, tooltips
		     appear) without ever shifting the toggle off-center. Below sm the
		     counters need full viewport width to read without crowding, so the
		     button + toggle share row 1 and the counters get row 2 alone — the
		     inner `sm:contents` wrapper disappears at sm+ so its children become
		     direct grid items again. -->
		<div
			class="magi-panel flex shrink-0 cursor-pointer flex-col gap-2 rounded-lg bg-gray-900/70 px-4 py-2 text-xs select-none sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-x-4 sm:gap-y-0"
			onclick={onStatusBarClick}
			onkeydown={onStatusBarKeydown}
			role="button"
			tabindex="0"
			aria-label="Cycle layout focus"
		>
			<div class="flex items-center justify-between sm:contents">
				<button
					type="button"
					onclick={handleNewConversation}
					disabled={loading || conversation.length === 0}
					class="magi-newconv-btn flex w-fit items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1 font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-50"
				>
					<MessageSquarePlus size={12} /> New conversation
				</button>
				<LayoutToggle focus={layoutFocus} onchange={setLayoutFocus} />
			</div>
			<div class="-mx-4 border-t border-gray-800 sm:hidden" aria-hidden="true"></div>
			<div
				class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-gray-400 sm:justify-end"
			>
				{#if conversation.length > 0}
					<span
						use:tooltip={'Completed turns — each turn is one prompt answered by all three MAGI, then merged into a consensus. Multi-turn context carries forward across turns.'}
						>{conversation.length} turn{conversation.length === 1 ? '' : 's'}</span
					>
					<span class="text-gray-500">·</span>
					<span class="magi-token-total text-gray-500" use:tooltip={conversationTokensTooltip}>
						<TokenCount
							input={conversationUsage.input}
							output={conversationUsage.output}
							estimated={conversationEstimated}
							total
						/>
					</span>
					{#if contextWarnings.length > 0}
						<span class="text-gray-500">·</span>
						<span class="flex items-center gap-1 magi-warn">
							<AlertTriangle size={12} />
							{contextWarningLabels.join(', ')} near context limit
						</span>
					{/if}
				{:else}
					<span class="text-gray-600">0 turns</span>
					<span class="text-gray-600">·</span>
					<span class="text-gray-600">0 tokens</span>
				{/if}
			</div>
		</div>

		<!-- Global error -->
		{#if live.error}
			<div
				class="flex shrink-0 items-center gap-2 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300"
			>
				<CircleAlert size={16} class="shrink-0" />
				{live.error}
			</div>
		{/if}

		<!-- Three MAGI panels -->
		<div
			class="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:grid-rows-1 {nodesCollapsed
				? 'shrink-0'
				: 'flex-2 md:min-h-0 md:flex-1 md:overflow-hidden'}"
		>
			{#each assignments as assignment, i (assignment.node)}
				{#if i > 0}
					<div class="hidden items-center md:flex">
						<button
							type="button"
							onclick={() => handleSwap(i - 1, i)}
							disabled={loading}
							class="rounded p-1 text-gray-600 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-50"
							title="Swap configurations"
						>
							<ArrowLeftRight size={16} />
						</button>
					</div>
				{/if}
				<MagiPanel
					name={assignment.node}
					models={availableModels}
					gateway={configuredNodes.has(i) ? assignment.gateway : ''}
					provider={configuredNodes.has(i) ? assignment.provider : ''}
					modelId={configuredNodes.has(i) ? assignment.modelId : ''}
					modelDisplayName={getModelDisplayName(assignment)}
					transcript={nodeTranscripts[assignment.node]}
					liveQuery={activeTurnQuery}
					liveInput={liveNodeUsage[assignment.node]?.inputTokens ?? 0}
					liveOutput={liveNodeOutputs[assignment.node].tokens}
					liveCached={liveNodeUsage[assignment.node]?.cachedTokens ?? 0}
					liveEstimated={liveNodeOutputs[assignment.node].estimated}
					contextUsed={latestNodeInput(assignment.node)}
					contextWindow={modelContextWindow(assignment.modelId)}
					text={responseMap.get(assignment.node)?.text ?? live.modelStreams[assignment.node]}
					debateRounds={live.debateRounds[assignment.node]}
					collapsed={nodesCollapsed}
					error={errorMap.get(assignment.node) ?? ''}
					status={getNodeStatus(assignment.node)}
					temperament={temperaments ? NODE_TEMPERAMENTS[assignment.node] : undefined}
					{genericLabels}
					{scrollMode}
					disabled={loading}
					usedProviders={getUsedProviders(i)}
					onchange={(gw, prov, model) => handleNodeChange(i, gw, prov, model)}
					onlabelclick={() => (genericLabels = !genericLabels)}
					onheadertoggle={() => cycleLayout('nodes')}
				/>
			{/each}
		</div>

		<!-- Consensus -->
		<div class={consensusCollapsed ? 'shrink-0' : 'flex-1 md:min-h-0'}>
			<ConsensusView
				transcript={consensusTranscript}
				liveQuery={activeTurnQuery}
				liveInput={liveConsensusUsage?.inputTokens ?? 0}
				liveOutput={liveConsensusOutput.tokens}
				liveCached={liveConsensusUsage?.cachedTokens ?? 0}
				liveEstimated={liveConsensusOutput.estimated}
				contextUsed={latestConsensusInput()}
				contextWindow={modelContextWindow(consensusAssignment.modelId)}
				text={live.consensusStream}
				fullText={live.consensusFinal}
				debateVerdict={live.debateVerdict}
				debateSummary={live.debateSummary}
				loading={effectiveLoading}
				{allModelsResponded}
				respondedCount={live.responses.length}
				erroredCount={live.modelErrors.length}
				warning={live.consensusWarning}
				{strategy}
				{consensusNode}
				consensusGateway={consensusAssignment.gateway}
				consensusProvider={consensusAssignment.provider}
				consensusModelDisplayName={getModelDisplayName(consensusAssignment)}
				{consensusTemperament}
				{temperamentAwareness}
				{genericLabels}
				{scrollMode}
				disabled={loading}
				collapsed={consensusCollapsed}
				onstrategychange={(s) => (strategy = s)}
				onconsensuschange={(node) => (consensusNode = node)}
				onconsensustemperamentchange={temperaments ? (v) => (consensusTemperament = v) : undefined}
				onawarenesschange={temperaments ? (v) => (temperamentAwareness = v) : undefined}
				onheadertoggle={() => cycleLayout('consensus')}
			/>
		</div>
	</main>

	<footer class="shrink-0 py-1.5 text-center magi-meta text-gray-600">
		<a
			href="https://github.com/retrobit/magi"
			target="_blank"
			rel="noopener noreferrer"
			class="transition-colors hover:text-gray-400">MAGI</a
		>
		·
		<a
			href="https://github.com/retrobit"
			target="_blank"
			rel="noopener noreferrer"
			class="transition-colors hover:text-gray-400">© 2026 retrobit</a
		>
		·
		<a
			href="https://github.com/retrobit/magi/blob/main/LICENSE"
			target="_blank"
			rel="noopener noreferrer"
			class="transition-colors hover:text-gray-400">MIT</a
		>
	</footer>
</div>
