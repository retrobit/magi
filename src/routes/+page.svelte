<script lang="ts">
	import MagiBackground from '$lib/components/MagiBackground.svelte';
	import PerfOverlay from '$lib/components/PerfOverlay.svelte';
	import TierSelector from '$lib/components/TierSelector.svelte';
	import MagiPanel from '$lib/components/MagiPanel.svelte';
	import ConsensusView from '$lib/components/ConsensusView.svelte';
	import LayoutToggle from '$lib/components/LayoutToggle.svelte';
	import MagiHeader from '$lib/components/MagiHeader.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import Splash from '$lib/components/Splash.svelte';
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
	import { assembleRetryPriors } from '$lib/magi/retry';
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
		type ScrollMode,
		type BgVariant,
		PALETTES,
		REVEAL_NODE_NAMES,
		type Palette,
		type MotionMode
	} from '$lib/magi/types';
	import { getModelsForTier, findModelEntry } from '$lib/magi/registry';
	import { resolveNodeTemperament, type CustomTemperaments } from '$lib/magi/temperaments';
	import TemperamentEditor from '$lib/components/TemperamentEditor.svelte';
	import { DEFAULT_STRATEGY, DEFAULT_DEBATE_ROUNDS, type StrategyName } from '$lib/magi/consensus';
	import type { StreamEventName, StreamEventPayloads } from '$lib/magi/stream-events';
	import {
		loadPrefs,
		savePrefs,
		loadConversations,
		saveConversations,
		type PersistedSnapshot,
		type PersistedSettings
	} from '$lib/magi/persistence';
	import { onMount, onDestroy, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		Triangle,
		LoaderCircle,
		CircleAlert,
		AlertTriangle,
		ArrowLeftRight,
		X,
		Brain,
		Target,
		Handshake,
		Copy,
		Check,
		Dices,
		MessageSquarePlus,
		Pencil
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
	// Multi-Round Debate round ceiling (the "Rounds" picker). Inert for other strategies.
	let debateRounds = $state(DEFAULT_DEBATE_ROUNDS);
	let temperaments = $state(false);
	let genericLabels = $state(true);
	const activeNodeLabels = $derived(genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS);
	let query = $state('');
	let loading = $state(false);
	let configuredNodes = new SvelteSet([0, 1, 2]);
	let consensusNode: MagiNodeName = $state('MAGI_1');
	let availableModels = $state<AvailableModel[]>([]);
	let modelsLoading = $state(true);
	let copiedQuery = $state(false);
	let consensusTemperament = $state(false);
	let temperamentAwareness = $state(false);
	// Per-node temperament overrides (the "edit personas" feature). Sparse — a seat
	// absent here keeps its built-in temperament. Only used when `temperaments` is on.
	let customTemperaments = $state<CustomTemperaments>({});
	let showTemperamentEditor = $state(false);
	// Effective temperament (label + persona + badge gloss) per seat, override applied.
	const resolvedTemperaments = $derived.by(() => {
		const out = {} as Record<MagiNodeName, ReturnType<typeof resolveNodeTemperament>>;
		for (const node of MAGI_NODE_NAMES)
			out[node] = resolveNodeTemperament(node, customTemperaments);
		return out;
	});
	// Deliberation modifiers. Opinionated → models commit to one answer on open-ended
	// questions (all strategies). Collaborative → debaters lean toward convergence
	// (Multi-Round Debate only). Independent of each other and of Temperaments.
	let opinionated = $state(false);
	let collaborative = $state(false);
	let bgVariant = $state<BgVariant>('off');
	let palette = $state<Palette>('nebula');
	let theme = $state<'dark' | 'light'>('dark');
	let scrollMode = $state<ScrollMode>('follow');
	// Footer copyright year — derived from the clock so it rolls over on its own.
	const currentYear = new Date().getFullYear();
	// Motion preference. `normal` (default) stills the ambient background + cursor
	// spotlight but keeps every other UI animation; `full` animates everything;
	// `reduced` stills all motion. Drives two <html> classes downstream: `.calm-bg`
	// (normal) and `.reduce-motion` (reduced).
	let motionMode = $state<MotionMode>('normal');
	// Focus accordion between the node row and the consensus. The status-bar layout
	// control sets one of three states: nodes expanded, consensus expanded, or a
	// balanced split (the default — both zones share the view so neither buries
	// the other before the user has decided where to focus).
	let layoutFocus = $state<'balanced' | 'nodes' | 'consensus'>('balanced');
	// Auto-layout: when on (the default), the focus accordion follows the run
	// lifecycle — nodes while they think, balanced while the consensus streams,
	// consensus once it lands. Picking any manual segment turns it off; the Auto
	// segment turns it back on and immediately reasserts the current phase.
	let autoLayout = $state(true);
	const nodesCollapsed = $derived(layoutFocus === 'consensus');
	const consensusCollapsed = $derived(layoutFocus === 'nodes');
	// The two resizable layout zones, tweened on a focus change.
	let nodeZoneEl = $state<HTMLElement>();
	let consensusZoneEl = $state<HTMLElement>();

	// The LayoutToggle is the sole way to change layout focus. The zones resize via
	// a flex/grid reflow that would otherwise snap, so we FLIP it: measure each
	// zone's height, apply the new layout, then animate old→new in explicit pixels.
	// A CSS transition can't do this cleanly — the flex-basis swap (fill ↔ header)
	// snaps mid-tween. WAAPI height reverts to the flex height on finish, so there's
	// no end-state jump. Skipped under reduced motion.
	function setLayoutFocus(focus: 'balanced' | 'nodes' | 'consensus') {
		const reduced =
			motionMode === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const zones = [nodeZoneEl, consensusZoneEl].filter((z): z is HTMLElement => !!z);
		if (reduced || zones.length === 0) {
			layoutFocus = focus;
			return;
		}
		const before = zones.map((z) => z.getBoundingClientRect().height);
		layoutFocus = focus;
		void tick().then(() => {
			zones.forEach((z, i) => {
				const after = z.getBoundingClientRect().height;
				if (Math.abs(after - before[i]) < 1) return;
				z.getAnimations().forEach((a) => a.cancel());
				// A `flex-1` zone ignores an animated `height` (flex-grow wins), so the
				// tween only moved the zone that collapsed to a header — transitions
				// INTO the balanced layout (both zones flex-1) didn't slide at all.
				// Pin flex off + an explicit height for the tween so the keyframes
				// drive the size, then hand back to flex on finish (which lands on the
				// same height the fill is holding, so there's no end jump).
				const prevFlex = z.style.flex;
				z.style.flex = 'none';
				z.style.height = `${before[i]}px`;
				const anim = z.animate([{ height: `${before[i]}px` }, { height: `${after}px` }], {
					duration: 280,
					easing: 'ease',
					fill: 'forwards'
				});
				let cleaned = false;
				const restore = () => {
					if (cleaned) return;
					cleaned = true;
					anim.cancel();
					z.style.flex = prevFlex;
					z.style.height = '';
				};
				anim.onfinish = restore;
				anim.oncancel = restore;
			});
		});
	}

	// Coarse run lifecycle, used to drive auto-layout. `thinking` = some MAGI is
	// still generating (phase-1 answer or a debate round) and the consensus hasn't
	// emitted yet; `synthesizing` = a MAGI is still working while the consensus
	// streams alongside (the debate ledger); `reviewing` = every MAGI is done but
	// the consensus is still streaming — hand it the full panel now rather than
	// waiting for it to finish; `done` = the committed turn has a consensus; `idle`
	// = nothing has run yet.
	type RunPhase = 'idle' | 'thinking' | 'synthesizing' | 'reviewing' | 'done';
	const runPhase = $derived.by<RunPhase>(() => {
		if (effectiveLoading) {
			const nodesThinking = MAGI_NODE_NAMES.some(
				(n) => getNodeStatus(n) === 'pending' || nodeDebating(n)
			);
			if (nodesThinking) return live.consensusStream ? 'synthesizing' : 'thinking';
			// All MAGI have settled — expand the consensus even though it's still
			// streaming, so we're not stuck in the split view waiting on it to finish.
			return 'reviewing';
		}
		if (conversation.length > 0 && conversation.at(-1)?.consensus) return 'done';
		return 'idle';
	});

	const PHASE_FOCUS: Record<RunPhase, 'balanced' | 'nodes' | 'consensus' | null> = {
		idle: null,
		thinking: 'nodes',
		synthesizing: 'balanced',
		reviewing: 'consensus',
		done: 'consensus'
	};

	// Auto-layout: when on, move the focus accordion as the run progresses. Only
	// fires on a *phase change* (so a manual nudge between phases sticks until the
	// next transition), and stays disarmed until the first real `thinking` phase so
	// a restored conversation doesn't yank the layout on load. Plain `let` (not
	// $state) — these are effect-local bookkeeping, never rendered.
	let lastRunPhase: RunPhase | null = null;
	let autoLayoutArmed = false;
	$effect(() => {
		const phase = runPhase;
		const prev = lastRunPhase;
		lastRunPhase = phase;
		if (phase === 'thinking') autoLayoutArmed = true;
		if (!autoLayout || !autoLayoutArmed || phase === prev) return;
		const focus = PHASE_FOCUS[phase];
		if (focus) setLayoutFocus(focus);
	});

	// LayoutToggle dispatch: the Auto segment re-arms auto-follow and snaps to the
	// current phase's focus; any manual segment turns auto off and pins that focus.
	function handleLayoutChoice(choice: 'auto' | 'balanced' | 'nodes' | 'consensus') {
		if (choice === 'auto') {
			autoLayout = true;
			autoLayoutArmed = true;
			setLayoutFocus(PHASE_FOCUS[runPhase] ?? layoutFocus);
		} else {
			autoLayout = false;
			setLayoutFocus(choice);
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

	function fillPrompt(prompt: string) {
		query = prompt;
		// Defer past the DOM flush, then bring the input into view and focus it. On
		// mobile the example chips sit in the consensus panel well below the input,
		// so an explicit scroll is what carries the user back up to the populated
		// box — focus() alone fired too early (before the fill rendered) and the
		// first tap didn't scroll. Also lands keyboard/SR users where the workflow
		// continues (Execute is unfocusable while the input is empty).
		void tick().then(() => {
			queryInputEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			// Don't pop the on-screen keyboard on touch — the user wants to review the
			// filled prompt, not edit it. Focus only with a fine pointer, so keyboard /
			// SR users still land in the box where the workflow continues.
			if (!window.matchMedia('(pointer: coarse)').matches) queryInputEl?.focus();
		});
	}
	// The dice icon animates on each roll — click feedback that fires even when
	// the random pick lands on the prompt already in the box (otherwise re-rolling
	// the same prompt looks like the button did nothing). WAAPI replays the
	// keyframes unconditionally. This is a discrete, user-triggered confirmation
	// (not ambient motion), so it still fires under reduce-motion — just as a
	// gentle scale pop instead of the full tumble.
	let diceEl = $state<HTMLSpanElement>();
	function rollDice() {
		const reduced =
			motionMode === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		diceEl?.animate(
			reduced
				? [
						{ transform: 'scale(1)' },
						{ transform: 'scale(1.18)', offset: 0.5 },
						{ transform: 'scale(1)' }
					]
				: [
						{ transform: 'rotate(0deg) scale(1)' },
						{ transform: 'rotate(360deg) scale(1.25)', offset: 0.6 },
						{ transform: 'rotate(360deg) scale(1)' }
					],
			{ duration: reduced ? 220 : 450, easing: 'ease-out' }
		);
	}

	// A random/example opener awaiting confirmation to replace the current
	// conversation. The random prompts are standalone starters, so dropping one
	// into an existing thread as a follow-up reads as a topic non-sequitur — when
	// a conversation exists, we confirm a fresh start first. null = nothing pending.
	let pendingPrompt = $state<string | null>(null);

	function fillRandomPrompt() {
		const prompt = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
		// Mid-conversation: confirm wiping the thread before a fresh opener. Idle:
		// nothing to lose, so fill straight away.
		if (conversation.length > 0) {
			pendingPrompt = prompt;
			return;
		}
		rollDice();
		fillPrompt(prompt);
	}

	// Example-prompt chips share the same guard. They only render on an empty
	// conversation today, so the confirm never actually fires for them — but
	// routing them here keeps it correct if they ever surface mid-thread.
	function requestExamplePrompt(prompt: string) {
		if (conversation.length > 0) {
			pendingPrompt = prompt;
			return;
		}
		fillPrompt(prompt);
	}

	// Confirmed: clear the conversation, then drop the pending opener into the box.
	function confirmPendingPrompt() {
		const prompt = pendingPrompt;
		pendingPrompt = null;
		if (prompt === null) return;
		handleNewConversation();
		fillPrompt(prompt);
	}

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
			modelStreams: { MAGI_1: '', MAGI_2: '', MAGI_3: '' },
			modelErrors: [],
			debateRounds: { MAGI_1: [], MAGI_2: [], MAGI_3: [] },
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
	// code names or generic MAGI numbers — rather than the raw node key.
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
			debateSummary: turn.debateSummary,
			consensusWarning: turn.consensusWarning,
			// Clean successes only: errored nodes may carry a persisted partial in
			// nodeResponses, which must not count as "responded" for the gates.
			respondedCount: MAGI_NODE_NAMES.filter(
				(n) => turn.nodeResponses[n] !== undefined && !turn.nodeErrors[n]
			).length,
			aborted: turn.aborted
		}))
	);

	// Effective loading flag: union of the real fetch-in-flight `loading` state and
	// the debug panel's preview flag, so the pending UI (verb sweeps, glow,
	// consensus loader) lights up the same whether the data is real or injected.
	const effectiveLoading = $derived(loading || live.debugPreviewLoading);

	// Error to show in the global banner — live during streaming, then falls back
	// to the last committed turn's error so the banner survives resetLiveState().
	// The transcript fallback keeps a committed turn's error visible after the
	// live-state reset — but it must yield while a NEW turn is in flight, or a
	// retry streams under its predecessor's stale red banner.
	const displayedError = $derived(
		live.error || (activeTurnQuery ? '' : (conversation.at(-1)?.error ?? ''))
	);

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
			// Aborted turns produced partial text but weren't a clean success —
			// surface as 'unknown' so the panel renders the "Stopped" chip.
			if (last.aborted) return 'unknown';
			if (last.nodeResponses[node]) return 'success';
		}
		return 'idle';
	}

	// A node "thinks" while it actively generates: phase 1 (pending), and — in a
	// Multi-Round Debate — through each round, until the final synthesis begins
	// (that's the consensus node's work, not the debaters'). The debate only starts
	// once EVERY phase-1 answer is in, so gate on `allModelsResponded`: a node that
	// finished phase 1 early shouldn't keep pulsing while it waits for a slower peer
	// — it's idle until the rounds actually engage it. Erroring nodes never enter
	// the debate, so they're excluded via `responseMap`. The debater is generating
	// until the consensus streams the `---` divider that separates the round ledger
	// from the synthesis.
	const DEBATE_DIVIDER = '\n\n---\n\n';
	function nodeDebating(node: MagiNodeName): boolean {
		return (
			effectiveLoading &&
			strategy === 'debate' &&
			allModelsResponded &&
			!!responseMap.get(node) &&
			!live.consensusStream.includes(DEBATE_DIVIDER)
		);
	}

	// Pulse-glow control for a node: null = not thinking (no glow). A stable,
	// non-null key means "thinking" — the glow runs as ONE continuous heartbeat for
	// as long as the node is working: phase 1 (pending) and, in a Multi-Round Debate,
	// straight through every critique/revise round until the synthesis begins. The
	// key is constant across the whole run (not a per-round counter) so the animation
	// never restarts mid-flight; it drops to null when the node is done, so the next
	// turn re-triggers a fresh glow.
	function nodePulse(node: MagiNodeName): number | null {
		return getNodeStatus(node) === 'pending' || nodeDebating(node) ? 1 : null;
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
		consensusNode = 'MAGI_1';
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
		debateRounds = s.debateRounds ?? DEFAULT_DEBATE_ROUNDS;
		temperaments = s.temperaments;
		consensusTemperament = s.consensusTemperament;
		temperamentAwareness = s.temperamentAwareness;
		customTemperaments = s.customTemperaments ?? {};
		opinionated = s.opinionated ?? false;
		collaborative = s.collaborative ?? false;
		genericLabels = REVEAL_NODE_NAMES ? s.genericLabels : true;
		theme = s.theme;
		bgVariant = s.bgVariant;
		palette = s.palette ?? 'nebula';
		scrollMode = s.scrollMode;
		// Intentionally NOT restoring `s.layoutFocus`: every reload starts from the
		// balanced/shared layout (the in-code default) regardless of how it was left,
		// so a fresh session always opens neutral. Auto-layout then takes over once a
		// run begins.
		autoLayout = s.autoLayout ?? true;
		// Back-compat: older payloads stored a `reduceMotion` boolean. Map true →
		// reduced, false → full (an explicit Full choice); a fresh payload with
		// neither field defaults to the new `normal` mode.
		motionMode =
			s.motionMode ??
			(s.reduceMotion === undefined ? 'normal' : s.reduceMotion ? 'reduced' : 'full');
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

	// Intro splash. Auto-plays on every page load; the header MAGI mark replays
	// it on demand. Only `decode` is active; `boot` and `convergence` stay
	// implemented in Splash.svelte but aren't reachable from the UI (a
	// `?splash=<concept>` query param can still force them for dev/preview).
	// The only active concept — the per-load default and the header-mark replay.
	const SPLASH_CONCEPTS = ['decode'] as const;
	// All implemented concepts — kept for the `?splash=` dev/preview param only.
	const SPLASH_CONCEPTS_ALL = ['decode', 'boot', 'convergence'] as const;
	type SplashConcept = (typeof SPLASH_CONCEPTS_ALL)[number];
	let showSplash = $state(false);
	let splashConcept = $state<SplashConcept>('decode');
	let splashNonce = $state(0);
	function replaySplash() {
		const i = SPLASH_CONCEPTS.indexOf(splashConcept as (typeof SPLASH_CONCEPTS)[number]);
		splashConcept = SPLASH_CONCEPTS[(i + 1) % SPLASH_CONCEPTS.length];
		splashNonce += 1;
		showSplash = true;
	}

	onMount(async () => {
		// Splash runs first so it can paint over the hydrating shell. It plays on
		// every load; the `?splash=<concept>` param only overrides which concept.
		try {
			const forced = new URLSearchParams(location.search).get('splash');
			if (forced && (SPLASH_CONCEPTS_ALL as readonly string[]).includes(forced)) {
				splashConcept = forced as SplashConcept;
			}
		} catch {
			// `location` unavailable — fall back to the default concept.
		}
		showSplash = true;

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
			debateRounds,
			temperaments,
			consensusTemperament,
			temperamentAwareness,
			customTemperaments,
			opinionated,
			collaborative,
			genericLabels,
			theme,
			bgVariant,
			palette,
			scrollMode,
			layoutFocus,
			autoLayout,
			motionMode
		};
		if (!prefsHydrated) return;
		persistedSnapshots[activeTier] = snap;
		savePrefs({ tier: activeTier, snapshots: persistedSnapshots, settings });
	});

	// The theme class lives on <html>, not the page root, so body-portaled
	// elements (the tooltip) inherit the light-mode variable overrides too.
	$effect(() => {
		// `reduced` stills everything; `normal` only stills the background/spotlight
		// (via `.calm-bg`); `full` sets neither class.
		document.documentElement.classList.toggle('reduce-motion', motionMode === 'reduced');
		document.documentElement.classList.toggle('calm-bg', motionMode === 'normal');
	});

	$effect(() => {
		document.documentElement.classList.toggle('light', theme === 'light');
	});

	// Palette is a class on <html> (like `.light`) so its var overrides reach
	// body-portaled elements (tooltip) too. Exactly one palette class is set.
	$effect(() => {
		const el = document.documentElement;
		for (const p of PALETTES) el.classList.toggle(`palette-${p}`, palette === p);
	});

	// Persist the active tier's conversation thread on every change.
	$effect(() => {
		const activeTier = tier;
		const turns = conversation.map((t) => ({ ...t }));
		if (!prefsHydrated) return;
		conversationsByTier[activeTier] = turns;
		saveConversations(conversationsByTier);
	});

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
			consensusNode = 'MAGI_1';
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

	// Whether this turn was aborted by the user (set in handleSubmit's AbortError
	// catch branch, read by finalizeTurn to stamp the committed turn).
	let turnAborted = $state(false);
	let queryInputEl = $state<HTMLInputElement>();
	let abortButtonEl = $state<HTMLButtonElement>();

	// Commit the just-finished turn into the conversation, then clear live state.
	function finalizeTurn() {
		if (!activeTurnQuery) return;
		// Include partial model streams — a node that streamed text before aborting
		// or erroring still produced content worth persisting (and replaying as context).
		const hasContent =
			live.responses.length > 0 ||
			live.modelErrors.length > 0 ||
			live.consensusFinal !== '' ||
			live.consensusStream !== '' ||
			Object.values(live.modelStreams).some((t) => t !== '');
		if (!hasContent) {
			// Hard-failed or aborted before any usable content arrived — no turn to
			// commit. Restore the typed prompt so the user can resubmit without
			// re-typing, and still reset live state so token counts don't ghost.
			// The error must survive the reset: pre-stream failures (HTTP errors,
			// our own 429, network drops) set live.error in the same synchronous
			// continuation that lands here, so wiping it would mean the banner
			// never paints at all.
			const pendingError = live.error;
			query = activeTurnQuery;
			activeTurnQuery = '';
			turnAborted = false;
			resetLiveState();
			live.error = pendingError;
			return;
		}
		const committedConsensus = live.consensusFinal || live.consensusStream;
		const nodeResponses: Partial<Record<MagiNodeName, string>> = {};
		const nodeErrors: Partial<Record<MagiNodeName, string>> = {};
		for (const r of live.responses) nodeResponses[r.node] = r.text;
		for (const e of live.modelErrors) nodeErrors[e.node] = e.error;
		// For nodes that errored after streaming partial text, persist the partial
		// alongside the error so the transcript can render both.
		for (const node of MAGI_NODE_NAMES) {
			const partial = live.modelStreams[node];
			if (partial && !nodeResponses[node]) nodeResponses[node] = partial;
		}
		conversation = [
			...conversation,
			{
				query: activeTurnQuery,
				nodeResponses,
				nodeErrors,
				consensus: committedConsensus,
				consensusNode,
				nodeUsage: { ...liveNodeUsage },
				consensusUsage: liveConsensusUsage,
				strategy,
				debateVerdict: live.debateVerdict,
				debateSummary: live.debateSummary,
				debateRounds: { ...live.debateRounds },
				// Persist transient signals onto the turn so the error banner and
				// warning strip survive the live-state reset below.
				error: live.error || undefined,
				consensusWarning: live.consensusWarning || undefined,
				aborted: turnAborted || undefined
			}
		];
		// Live-turn state now belongs to the committed turn — reset it.
		activeTurnQuery = '';
		turnAborted = false;
		resetLiveState();
	}

	function handleNewConversation() {
		if (loading) return;
		conversation = [];
		activeTurnQuery = '';
		debugScenario = freshDebugScenario();
		resetLiveState();
		// Back to a clean slate: when auto-layout is on, return the focus accordion
		// to the balanced/shared view so the next turn starts from neutral ground
		// (rather than lingering on the previous turn's expanded-consensus layout).
		if (autoLayout) setLayoutFocus('balanced');
	}

	// Build the POST body for a MAGI request. Extracted so the retry paths can
	// reuse it without duplicating the field list.
	function buildRequestBody(opts: {
		turnQuery: string;
		forceRetry?: boolean;
		retryNodes?: MagiNodeName[];
		priorResponses?: { node: MagiNodeName; text: string }[];
	}) {
		return JSON.stringify({
			query: opts.turnQuery,
			tier,
			strategy,
			debateRounds,
			consensusNode,
			assignments,
			temperaments,
			consensusTemperament,
			temperamentAwareness,
			opinionated,
			collaborative,
			genericLabels,
			// Only send overrides when some exist (and only matter when temperaments on).
			...(Object.keys(customTemperaments).length ? { customTemperaments } : {}),
			history: buildHistory(),
			...(opts.forceRetry ? { forceRetry: true } : {}),
			...(opts.retryNodes ? { retryNodes: opts.retryNodes } : {}),
			...(opts.priorResponses ? { priorResponses: opts.priorResponses } : {})
		});
	}

	async function handleSubmit(e: SubmitEvent, opts: { forceRetry?: boolean } = {}) {
		e.preventDefault();
		if (loading || !allConfigured) return;
		debugScenario = freshDebugScenario();

		const turnQuery = query.trim();
		if (!turnQuery) return;
		query = '';
		activeTurnQuery = turnQuery;
		turnAborted = false;

		abortController?.abort();
		abortController = new AbortController();

		loading = true;
		resetLiveState();

		await streamRequest(buildRequestBody({ turnQuery, forceRetry: opts.forceRetry }));

		live.streamDone = true;
		loading = false;
		finalizeTurn();
	}

	// POST the body and pump the SSE stream into `live` via handleEvent. Shared by
	// the normal submit path and the per-node retry path; the caller owns the
	// surrounding lifecycle (loading flag, live hydration, finalizeTurn).
	async function streamRequest(body: string) {
		try {
			const res = await fetch('/api/magi', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
				signal: abortController!.signal
			});

			if (!res.ok) {
				const retryAfter = res.headers.get('Retry-After');
				const data = await res.json().catch(() => ({ error: 'Request failed' }));
				if (res.status === 429 && retryAfter) {
					// Surface a concrete wait time from the server's Retry-After header
					// rather than a generic "slow down" message.
					live.error = `Too many requests — try again in ${retryAfter}s`;
				} else {
					live.error = data.error ?? `Request failed (${res.status})`;
				}
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
			if (err instanceof DOMException && err.name === 'AbortError') {
				// User-initiated abort — mark the turn so the transcript renders
				// a neutral "Stopped" chip instead of the green success check.
				turnAborted = true;
			} else {
				live.error = err instanceof Error ? err.message : 'Network error';
			}
		}
	}

	// Re-run a single errored node on the latest turn, then re-synthesize consensus
	// from the merged set — without re-billing the two nodes that already answered.
	// Implemented as "reopen the committed turn as the live turn, restream, recommit":
	// the last turn is hydrated back into `live` (minus the node being retried, which
	// reverts to pending), popped off the conversation so finalizeTurn re-appends the
	// updated version, and the survivors ride along as `priorResponses` so the server
	// skips them in phase 1.
	async function retryNode(node: MagiNodeName) {
		const last = conversation.at(-1);
		if (loading || !last || !last.nodeErrors?.[node]) return;

		const hydrated = freshLiveState();
		const { responses, modelErrors, priorResponses, carriedUsage } = assembleRetryPriors(
			last,
			assignments,
			node
		);
		hydrated.responses = responses;
		hydrated.modelErrors = modelErrors;

		// Pop the turn so finalizeTurn re-appends the refreshed version, and so
		// buildHistory (the request's context) excludes it — the retry's history is
		// the turns BEFORE this one, exactly as the original turn saw.
		conversation = conversation.slice(0, -1);

		activeTurnQuery = last.query;
		turnAborted = false;
		abortController?.abort();
		abortController = new AbortController();
		loading = true;
		live = hydrated;
		liveNodeUsage = carriedUsage;
		liveConsensusUsage = undefined;

		await streamRequest(
			buildRequestBody({ turnQuery: last.query, retryNodes: [node], priorResponses })
		);

		live.streamDone = true;
		loading = false;
		finalizeTurn();
	}

	// Re-submit the last failed turn's query as a new turn, bypassing the
	// health-cache so models that were marked unhealthy actually get called again.
	function handleRetry() {
		const last = conversation[conversation.length - 1];
		if (!last || loading) return;
		query = last.query;
		const fakeEvent = new Event('submit') as unknown as SubmitEvent;
		void handleSubmit(fakeEvent, { forceRetry: true });
		// The Retry button unmounts as the banner clears — without an explicit
		// hand-off, keyboard focus drops to <body>. The Abort button that
		// replaces Execute is the action's natural continuation.
		void tick().then(() => abortButtonEl?.focus());
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
	{#if import.meta.env.DEV}
		<!-- Dev override: the all-red mark so a dev tab is easy to spot among prod
		     tabs (prod uses the RGB mark set in app.html). -->
		<link rel="icon" href="/favicons/triangles-red.svg" />
	{/if}
</svelte:head>

{#if showSplash}
	{#key splashNonce}
		<Splash
			concept={splashConcept}
			reduceMotion={motionMode === 'reduced'}
			ondone={() => (showSplash = false)}
		/>
	{/key}
{/if}

<div class="magi-bg flex h-screen flex-col overflow-hidden">
	<MagiBackground variant={bgVariant} bgStill={motionMode !== 'full'} />

	{#if import.meta.env.DEV}
		<PerfOverlay />
	{/if}

	<MagiHeader
		bind:theme
		bind:bgVariant
		bind:scrollMode
		bind:genericLabels
		bind:motionMode
		bind:palette
		{assignments}
		{loading}
		{debugScenario}
		{statsNonce}
		ondebugchange={(next) => {
			debugScenario = next;
			applyDebugScenario(next);
		}}
		onreplaysplash={replaySplash}
	/>

	<!-- Control strip -->
	<div class="magi-controls relative z-10 shrink-0 border-b border-gray-800 bg-gray-950/80">
		<div
			class="mx-auto flex max-w-[88rem] flex-col items-center gap-2 px-4 py-2 sm:flex-row sm:justify-between md:px-6"
		>
			<div class="flex items-center gap-2">
				<span class="text-xs text-gray-500">TIER</span>
				<TierSelector value={tier} onchange={handleTierChange} disabled={loading} />
				<!-- Free-tier models are flaky; the note hangs off a caution icon so it
				     stays out of the way until hovered/focused. Always rendered (only its
				     visibility toggles per tier) so its slot is reserved and switching
				     tiers can't shift the TIER control sideways. A button (not a span) so
				     it's keyboard-focusable without an a11y tabindex warning. -->
				<button
					type="button"
					class="flex shrink-0 cursor-default items-center magi-warn"
					class:invisible={tier !== 'free'}
					aria-hidden={tier !== 'free'}
					aria-label="Free-tier reliability warning"
					use:tooltip={tier === 'free'
						? 'Free-tier models can be flaky — retry or swap any node that stalls or fails.'
						: undefined}
				>
					<AlertTriangle size={14} />
				</button>
			</div>
			<div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
				<div class="flex items-center gap-2">
					<span class="text-xs text-gray-500">TEMPERAMENT</span>
					<button
						type="button"
						onclick={() => (temperaments = !temperaments)}
						disabled={loading}
						class="magi-toggle {temperaments ? 'magi-toggle-on' : ''}"
						use:tooltip={`Temperaments — give each MAGI a distinct persona (${activeNodeLabels.MAGI_1} ${resolvedTemperaments.MAGI_1.label}, ${activeNodeLabels.MAGI_2} ${resolvedTemperaments.MAGI_2.label}, ${activeNodeLabels.MAGI_3} ${resolvedTemperaments.MAGI_3.label}), so each answers in its own voice.`}
					>
						<Brain size={12} />
						<span class="inline-block w-7 text-left">{temperaments ? 'ON' : 'OFF'}</span>
					</button>
					<button
						type="button"
						onclick={() => (showTemperamentEditor = true)}
						disabled={loading}
						class="flex items-center justify-center rounded-lg bg-gray-800 p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-300 disabled:opacity-50"
						aria-label="Edit temperaments"
					>
						<Pencil size={12} />
					</button>
				</div>
				<div class="flex items-center gap-2">
					<span class="text-xs text-gray-500">OPINIONATED</span>
					<button
						type="button"
						onclick={() => (opinionated = !opinionated)}
						disabled={loading}
						class="magi-toggle {opinionated ? 'magi-toggle-on' : ''}"
						use:tooltip={'Opinionated — on open-ended questions, push each MAGI to commit to one definitive answer instead of hedging or listing many equally-weighted options.'}
					>
						<Target size={12} />
						<span class="inline-block w-7 text-left">{opinionated ? 'ON' : 'OFF'}</span>
					</button>
				</div>
				<!-- Collaborative only does anything in Multi-Round Debate (the only
				     strategy where models see each other), so it's shown only there. -->
				{#if strategy === 'debate'}
					<div class="flex items-center gap-2">
						<span class="text-xs text-gray-500">COLLABORATIVE</span>
						<button
							type="button"
							onclick={() => (collaborative = !collaborative)}
							disabled={loading}
							class="magi-toggle {collaborative ? 'magi-toggle-on' : ''}"
							use:tooltip={'Collaborative — the MAGI weigh each other’s reasoning and lean toward genuine convergence when warranted, without caving.'}
						>
							<Handshake size={12} />
							<span class="inline-block w-7 text-left">{collaborative ? 'ON' : 'OFF'}</span>
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Main content. App-shell scroll: the header + control strip above stay put
	     (shrink-0) and THIS region scrolls, so the scrollbar lives below the tier
	     strip instead of being drawn under the opaque, stacked header on mobile. -->
	<main
		class="mx-auto flex min-h-0 w-full max-w-[88rem] flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6"
	>
		<!-- Screen-reader live region for node/consensus state transitions. Kept
		     visually hidden so it doesn't affect layout; polite so it doesn't
		     interrupt in-progress speech. -->
		<div aria-live="polite" aria-atomic="true" class="sr-only">
			{#if loading}
				{#if live.modelErrors.length > 0}
					{activeNodeLabels[live.modelErrors[live.modelErrors.length - 1].node]} failed: {live
						.modelErrors[live.modelErrors.length - 1].error}
				{:else}
					Processing query…
				{/if}
			{:else if conversation.at(-1)?.aborted}
				Response stopped.
			{:else if displayedError}
				Error: {displayedError}
			{:else if conversation.length > 0}
				{#if conversation.at(-1)?.consensusWarning}
					Partial consensus: {conversation.at(-1)?.consensusWarning}
				{:else if conversation.at(-1)?.consensus}
					Consensus ready.
				{/if}
			{/if}
		</div>
		<!-- Query input -->
		<form onsubmit={handleSubmit} class="flex shrink-0 gap-3">
			<div class="relative flex-1">
				<input
					bind:this={queryInputEl}
					bind:value={query}
					type="text"
					aria-label="Query the MAGI system"
					placeholder="Ask the MAGI system…"
					disabled={loading}
					class="magi-input w-full overflow-hidden rounded-lg px-4 py-3 pr-10 text-ellipsis whitespace-nowrap focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none"
				/>
				{#if query.trim()}
					<button
						type="button"
						class="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 transition-colors hover:text-white"
						onclick={copyQuery}
						use:tooltip={'Copy prompt'}
					>
						{#if copiedQuery}
							<Check size={14} class="text-green-400" />
						{:else}
							<Copy size={14} />
						{/if}
					</button>
				{/if}
			</div>
			<button
				type="button"
				class="magi-randomize flex w-12 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50"
				onclick={fillRandomPrompt}
				disabled={loading}
				use:tooltip={'Fill the input with a random prompt — review it, then Execute'}
				aria-label="Random prompt"
			>
				<span class="inline-flex" bind:this={diceEl}>
					<Dices size={16} />
				</span>
			</button>
			{#if loading}
				<button
					bind:this={abortButtonEl}
					type="button"
					onclick={() => abortController?.abort()}
					aria-label="Abort"
					class="magi-btn group flex w-12 items-center justify-center gap-2 rounded-lg py-3 font-medium transition-colors hover:bg-red-600 sm:w-40"
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
					disabled={!allConfigured || modelsLoading || !query.trim()}
					aria-label="Execute"
					class="magi-btn flex w-12 items-center justify-center gap-2 rounded-lg py-3 font-medium transition-colors hover:bg-gray-500 disabled:opacity-50 disabled:hover:bg-(--magi-btn-bg) sm:w-40"
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
			class="magi-panel flex shrink-0 flex-col gap-2 rounded-lg px-4 py-2 text-xs select-none sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-x-4 sm:gap-y-0"
		>
			<div class="flex items-center justify-between sm:contents">
				<button
					type="button"
					onclick={handleNewConversation}
					disabled={loading || conversation.length === 0}
					class="magi-newconv-btn flex w-fit items-center gap-1.5 rounded-lg px-3 py-1 font-medium transition-colors disabled:opacity-50"
				>
					<MessageSquarePlus size={12} /> New conversation
				</button>
				<LayoutToggle focus={layoutFocus} auto={autoLayout} onchange={handleLayoutChoice} />
			</div>
			<div class="-mx-4 border-t border-gray-800 sm:hidden" aria-hidden="true"></div>
			<div
				class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-(--magi-text-muted) sm:justify-end"
			>
				{#if conversation.length > 0}
					<span
						use:tooltip={'Completed turns — each turn is one prompt answered by all three MAGI, then merged into a consensus. Multi-turn context carries forward across turns.'}
						>{conversation.length} turn{conversation.length === 1 ? '' : 's'}</span
					>
					<span class="text-gray-500">·</span>
					<span class="magi-token-total" use:tooltip={conversationTokensTooltip}>
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

		<!-- Global error — stays visible after turn commit because displayedError
		     falls back to the last committed turn's persisted error field. When
		     the last turn has node errors, offer a forceRetry path that bypasses
		     the health cache so the models are actually re-called. -->
		{#if displayedError}
			<div
				class="flex shrink-0 items-center gap-2 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300"
			>
				<CircleAlert size={16} class="shrink-0" />
				<span class="flex-1">{displayedError}</span>
				{#if !loading && conversation.at(-1)?.nodeErrors && Object.keys(conversation.at(-1)!.nodeErrors).length > 0}
					<button
						type="button"
						class="ml-2 shrink-0 rounded border border-red-700 px-2 py-0.5 text-xs text-red-300 transition-colors hover:bg-red-900"
						onclick={handleRetry}
					>
						Retry
					</button>
				{/if}
			</div>
		{/if}

		<!-- Three MAGI panels -->
		<div
			bind:this={nodeZoneEl}
			class="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:grid-rows-1 {nodesCollapsed
				? 'shrink-0'
				: 'flex-2 md:min-h-0 md:flex-1 md:overflow-hidden'}"
		>
			{#each assignments as assignment, i (assignment.node)}
				{#if i > 0}
					<div class="hidden md:flex md:items-center">
						<button
							type="button"
							onclick={() => handleSwap(i - 1, i)}
							disabled={loading}
							class="magi-randomize rounded p-1 transition-colors disabled:opacity-50"
							aria-label="Swap {activeNodeLabels[assignments[i - 1].node]} and {activeNodeLabels[
								assignment.node
							]} configurations"
						>
							<ArrowLeftRight size={14} />
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
					pulse={nodePulse(assignment.node)}
					temperament={temperaments ? NODE_TEMPERAMENTS[assignment.node] : undefined}
					temperamentLabel={temperaments ? resolvedTemperaments[assignment.node].label : undefined}
					temperamentDescription={temperaments
						? resolvedTemperaments[assignment.node].description
						: undefined}
					{genericLabels}
					{scrollMode}
					disabled={loading}
					usedProviders={getUsedProviders(i)}
					canRetry={!effectiveLoading}
					onretry={() => retryNode(assignment.node)}
					onchange={(gw, prov, model) => handleNodeChange(i, gw, prov, model)}
					onlabelclick={REVEAL_NODE_NAMES ? () => (genericLabels = !genericLabels) : undefined}
				/>
			{/each}
		</div>

		<!-- Consensus -->
		<div bind:this={consensusZoneEl} class={consensusCollapsed ? 'shrink-0' : 'flex-1 md:min-h-0'}>
			<ConsensusView
				onexampleselect={requestExamplePrompt}
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
				{debateRounds}
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
				ondebateroundschange={(n) => (debateRounds = n)}
				onconsensuschange={(node) => (consensusNode = node)}
				onconsensustemperamentchange={temperaments ? (v) => (consensusTemperament = v) : undefined}
				onawarenesschange={temperaments ? (v) => (temperamentAwareness = v) : undefined}
			/>
		</div>
	</main>

	<footer class="magi-footer shrink-0 py-1.5 text-center magi-meta text-gray-600">
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
			class="transition-colors hover:text-gray-400">© {currentYear} retrobit</a
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

{#if showTemperamentEditor}
	<TemperamentEditor
		value={customTemperaments}
		labels={activeNodeLabels}
		onsave={(next) => (customTemperaments = next)}
		onclose={() => (showTemperamentEditor = false)}
	/>
{/if}

{#if pendingPrompt !== null}
	<ConfirmModal
		title="Start a new conversation?"
		message="This clears the current conversation and starts fresh with the selected prompt."
		confirmLabel="New conversation"
		onconfirm={confirmPendingPrompt}
		oncancel={() => (pendingPrompt = null)}
	/>
{/if}
