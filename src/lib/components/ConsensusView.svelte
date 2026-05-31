<script lang="ts">
	import type {
		MagiNodeName,
		GatewayName,
		ConsensusTranscriptEntry,
		DebateVerdict,
		ScrollMode
	} from '$lib/magi/types';
	import {
		MAGI_NODE_NAMES,
		GATEWAY_LABELS,
		NODE_LABELS,
		NODE_LABELS_GENERIC,
		NODE_TEMPERAMENTS,
		TEMPERAMENT_LABELS,
		TEMPERAMENT_TOOLTIPS,
		CONSENSUS_GRADIENT,
		contextUsageClass,
		formatTokenCount,
		tokenUsageTooltip,
		getProviderLabel,
		isRouter
	} from '$lib/magi/types';
	import { type StrategyName } from '$lib/magi/consensus';
	import { STRATEGY_VERBS, SWEEP_MS, sweepVerb, sweepCycleLength } from '$lib/magi/loading-verbs';
	import { tooltip } from '$lib/actions/tooltip';
	import Markdown from './Markdown.svelte';
	import StrategyPicker from './StrategyPicker.svelte';
	import TokenCount from './TokenCount.svelte';
	import { Copy, Check, LoaderCircle, CircleCheck, AlertTriangle, Brain } from 'lucide-svelte';

	let copied = $state(false);
	function copyConsensus() {
		navigator.clipboard.writeText(fullText).catch(() => {});
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	interface Props {
		text: string;
		fullText: string;
		/** Debate outcome for the in-flight turn — picks the live banner variant. */
		debateVerdict?: DebateVerdict;
		/** A split's coalition shape — the live banner subtitle. */
		debateSummary?: string;
		loading: boolean;
		allModelsResponded: boolean;
		respondedCount?: number;
		erroredCount?: number;
		warning?: string;
		transcript?: ConsensusTranscriptEntry[];
		liveQuery?: string;
		liveInput?: number;
		liveOutput?: number;
		liveCached?: number;
		liveEstimated?: boolean;
		contextUsed?: number;
		contextWindow?: number;
		strategy: StrategyName;
		consensusNode: MagiNodeName;
		consensusGateway?: GatewayName;
		consensusProvider?: string;
		consensusModelDisplayName?: string;
		consensusTemperament?: boolean;
		temperamentAwareness?: boolean;
		genericLabels?: boolean;
		scrollMode?: ScrollMode;
		disabled?: boolean;
		onstrategychange?: (strategy: StrategyName) => void;
		onconsensuschange?: (node: MagiNodeName) => void;
		onconsensustemperamentchange?: (value: boolean) => void;
		onawarenesschange?: (value: boolean) => void;
		/** Collapsed to just the header (focus accordion). */
		collapsed?: boolean;
	}

	let {
		text,
		fullText,
		debateVerdict,
		debateSummary,
		loading,
		allModelsResponded,
		respondedCount = 0,
		erroredCount = 0,
		warning = '',
		transcript = [],
		liveQuery = '',
		liveInput = 0,
		liveOutput = 0,
		liveCached = 0,
		liveEstimated = false,
		contextUsed = 0,
		contextWindow,
		strategy,
		consensusNode,
		consensusGateway,
		consensusProvider,
		consensusModelDisplayName,
		consensusTemperament = false,
		temperamentAwareness = false,
		genericLabels = false,
		scrollMode = 'follow',
		disabled = false,
		onstrategychange,
		onconsensuschange,
		onconsensustemperamentchange,
		onawarenesschange,
		collapsed = false
	}: Props = $props();

	const nodeLabels = $derived(genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS);

	// Temperament awareness only shapes the Synthesis writer. Voting jurors already
	// score through their own lens, and the Debate synthesizer is a neutral scribe
	// (the lenses live in the debaters) — so the toggle is inert for both.
	const awarenessApplies = $derived(strategy === 'synthesis');

	// Consensus temperament lenses the consensus mechanism's participants — the
	// synthesizer (Synthesis) or jurors (Voting). Debate's synthesizer is neutral
	// and its debaters follow the main Temperaments toggle, so it's inert here.
	const consensusTempApplies = $derived(strategy !== 'debate');

	// Voting tallies all jurors equally; there's no single consensus node, so
	// both the Node dropdown and the consensus-temperament badge are inert.
	const consensusNodeApplies = $derived(strategy !== 'voting');

	// A consensus exists if it's streaming live or was committed to the transcript.
	// Lets the header's done-check (and the debate banner) survive the live-state
	// reset that fires when a turn commits.
	const lastTurnConsensus = $derived(!!transcript[transcript.length - 1]?.consensus);
	const hasConsensus = $derived(text !== '' || lastTurnConsensus);

	// A finished debate earns a headline banner — the rounds are done and a final
	// synthesis is on screen. Gradient-clipped text reuses the three-MAGI triad.
	const debateComplete = $derived(strategy === 'debate' && !loading && text !== '');
	const gradientText = `${CONSENSUS_GRADIENT}; -webkit-background-clip: text; background-clip: text; color: transparent;`;

	// Debate streams its round ledger into `text`, then a `---` divider, then the
	// synthesized answer. While the rounds are still running (no divider yet) the
	// ledger sits static between rounds — so we keep the pulsating verb beneath it
	// to signal the debate is still deliberating, not stalled.
	const DEBATE_DIVIDER = '\n\n---\n\n';
	const debateRounding = $derived(
		strategy === 'debate' && loading && text !== '' && !text.includes(DEBATE_DIVIDER)
	);

	// Drives both the loader effect and its placement: true the whole time the
	// consensus is being produced but its answer hasn't begun streaming.
	const showConsensusLoader = $derived((loading && allModelsResponded && !text) || debateRounding);

	// Live loading-progress summary — how many of the MAGI have settled so far.
	const waitingLabel = $derived.by(() => {
		const parts = [`${respondedCount} / ${MAGI_NODE_NAMES.length} responded`];
		if (erroredCount > 0) parts.push(`${erroredCount} failed`);
		return `Waiting for MAGI — ${parts.join(', ')}…`;
	});

	const contextClass = $derived(contextUsageClass(contextUsed, contextWindow));

	// Cumulative consensus tokens: every completed turn plus the live turn.
	const totalInput = $derived(transcript.reduce((sum, t) => sum + t.inputTokens, 0) + liveInput);
	const totalOutput = $derived(transcript.reduce((sum, t) => sum + t.outputTokens, 0) + liveOutput);
	const totalCached = $derived(transcript.reduce((sum, t) => sum + t.cachedTokens, 0) + liveCached);
	const showTokens = $derived(totalInput > 0 || totalOutput > 0);
	const showContext = $derived(!!contextWindow && contextUsed > 0);

	// Breakdown for the static-width gauge's hover tooltip — kept off the gauge
	// itself so hovering never widens the header and shoves the layout control.
	const tokensTooltip = $derived(
		tokenUsageTooltip({ contextUsed, contextWindow, totalInput, totalOutput, totalCached })
	);

	// Follow mode: track the latest content while pinned to the bottom; a manual
	// scroll up pauses it until the viewport returns there. A ResizeObserver on
	// the content wrapper drives the follow — tracking the `text` prop would fire
	// before Markdown's throttled render grew the DOM, so every scroll chased a
	// stale height and never reached the bottom.
	let scrollEl = $state<HTMLDivElement>();
	let contentEl = $state<HTMLDivElement>();
	let liveTurnEl = $state<HTMLDivElement>();
	let pinned = $state(true);
	// Scroll-viewport height — gives the latest turn block a min-height in snap
	// mode so its prompt can always reach the top even on a short consensus.
	let viewportH = $state(0);
	const snapMinHeight = $derived(scrollMode === 'snap' ? `${viewportH}px` : undefined);

	function onScroll() {
		if (!scrollEl) return;
		pinned = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 24;
	}

	$effect(() => {
		if (!scrollEl || !contentEl) return;
		const observer = new ResizeObserver(() => {
			if (scrollMode === 'follow' && pinned && scrollEl) {
				scrollEl.scrollTop = scrollEl.scrollHeight;
			}
		});
		observer.observe(contentEl);
		return () => observer.disconnect();
	});

	// Snap mode: the moment a new turn is submitted (liveQuery appears), jump so
	// the new turn block sits at the top of the panel — the blank line above the
	// prompt lands at the very top, and the consensus then streams in below it.
	$effect(() => {
		if (scrollMode !== 'snap' || !liveQuery) return;
		if (collapsed) return;
		const el = scrollEl;
		const content = contentEl;
		if (!el || !content) return;
		const frame = requestAnimationFrame(() => {
			// Target the prompt line (first child), not the block, so the divider
			// and its padding scroll off above. Leave a few px of breathing room
			// above the prompt rather than pinning it flush to the top edge.
			const target = liveTurnEl?.firstElementChild ?? liveTurnEl;
			if (target) {
				el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - 8;
			}
		});
		return () => cancelAnimationFrame(frame);
	});

	// Snap mode + debate: each new round arrives as a `**Round N**` chunk in the
	// streamed text. When the round count grows, jump so that round's heading
	// sits at the top — mirroring how MagiPanel snaps per round. The Markdown
	// renderer throttles to ~100 ms, so we wait via a single-shot ResizeObserver
	// for the new heading to land in the DOM before measuring.
	const debateRoundCount = $derived(
		strategy === 'debate' ? (text.match(/\*\*Round \d+\*\*/g) ?? []).length : 0
	);
	let lastSnappedRound = $state(0);
	let snappedSynthesis = $state(false);
	$effect(() => {
		// Reset both watermarks on every new live turn (or when leaving snap mode).
		if (scrollMode !== 'snap' || !liveQuery) {
			lastSnappedRound = 0;
			snappedSynthesis = false;
			return;
		}
		if (collapsed) return;
		const count = debateRoundCount;
		if (!loading || count === 0 || count <= lastSnappedRound) return;
		const el = scrollEl;
		const content = contentEl;
		if (!el || !content) return;
		const desired = count;
		const observer = new ResizeObserver(() => {
			const headings = content.querySelectorAll('strong');
			let target: Element | null = null;
			for (let i = headings.length - 1; i >= 0; i -= 1) {
				if (headings[i].textContent === `Round ${desired}`) {
					target = headings[i];
					break;
				}
			}
			if (target) {
				el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - 8;
				lastSnappedRound = desired;
				observer.disconnect();
			}
		});
		observer.observe(content);
		// Safety: don't watch forever — Markdown throttle is ~100 ms, give it 500.
		const timeout = setTimeout(() => observer.disconnect(), 500);
		return () => {
			clearTimeout(timeout);
			observer.disconnect();
		};
	});

	// Snap mode + debate: when the `---` divider arrives (the boundary between
	// the round ledger and the streamed synthesis), snap so the divider lands at
	// the top of the viewport — the user reads the synthesis from its first line
	// rather than chasing it as it streams. Mirrors the round-snap pattern: wait
	// for Markdown's throttled re-render, find the last `<hr>` in the live block,
	// scroll it to top, fire exactly once per turn.
	const hasSynthesisStarted = $derived(strategy === 'debate' && text.includes(DEBATE_DIVIDER));
	$effect(() => {
		if (scrollMode !== 'snap' || !liveQuery || collapsed) return;
		if (!hasSynthesisStarted || snappedSynthesis) return;
		const el = scrollEl;
		const content = contentEl;
		if (!el || !content) return;
		const observer = new ResizeObserver(() => {
			const hr = Array.from(content.querySelectorAll('hr')).at(-1);
			if (!hr) return;
			el.scrollTop += hr.getBoundingClientRect().top - el.getBoundingClientRect().top - 8;
			snappedSynthesis = true;
			observer.disconnect();
		});
		observer.observe(content);
		const timeout = setTimeout(() => observer.disconnect(), 500);
		return () => {
			clearTimeout(timeout);
			observer.disconnect();
		};
	});

	// A block sweeps through the verb while the consensus itself is produced (all
	// nodes have responded). The verb list leans into the active strategy.
	const consensusVerbs = $derived(STRATEGY_VERBS[strategy]);
	let cVerbIndex = $state(0);
	let cSweep = $state(0);
	const consensusLoadingText = $derived(
		sweepVerb(consensusVerbs[cVerbIndex % consensusVerbs.length], cSweep)
	);
	$effect(() => {
		if (!showConsensusLoader) return;
		cVerbIndex = 0;
		cSweep = 0;
		const id = setInterval(() => {
			const word = consensusVerbs[cVerbIndex % consensusVerbs.length];
			if (cSweep + 1 >= sweepCycleLength(word)) {
				cSweep = 0;
				cVerbIndex += 1;
			} else {
				cSweep += 1;
			}
		}, SWEEP_MS);
		return () => clearInterval(id);
	});

	const gradientStyle = CONSENSUS_GRADIENT;

	const synthesisLabel = $derived.by(() => {
		if (!consensusGateway || !consensusProvider || !consensusModelDisplayName) return null;
		return isRouter(consensusGateway)
			? `${GATEWAY_LABELS[consensusGateway]} — ${getProviderLabel(consensusProvider)} ${consensusModelDisplayName}`
			: `${getProviderLabel(consensusProvider)} ${consensusModelDisplayName}`;
	});

	function handleNodeChange(e: Event) {
		const node = (e.target as HTMLSelectElement).value as MagiNodeName;
		onconsensuschange?.(node);
	}
</script>

{#snippet tokenFooter(input: number, output: number, estimated: boolean)}
	{#if input > 0 || output > 0}
		<p class="magi-token-split text-[10px] text-gray-500">
			<TokenCount {input} {output} {estimated} total />
		</p>
	{/if}
{/snippet}

<!-- Partial-data warning, presented like the node panels' "Model unavailable"
     card: icon on top, a short title, then the detail. Keeps the warning's amber
     palette and ⚠ symbol — only the layout/sizing matches the node error card. -->
{#snippet warningCard(message: string)}
	<div class="flex flex-col items-center justify-center gap-2 py-6 text-center">
		<AlertTriangle size={24} class="magi-warn" />
		<p class="text-sm font-medium magi-warn">Partial consensus</p>
		<p class="magi-banner-detail">{message}</p>
	</div>
{/snippet}

<!-- Headline banner crowning a completed multi-round debate. Two faces: a
     gradient "Consensus reached" when the MAGI agreed, an amber "Split decision"
     when they stayed divided. A walkover (one responder) earns no banner. -->
{#snippet debateBanner(verdict: DebateVerdict | undefined, summary: string | undefined)}
	{#if verdict === 'consensus'}
		<div class="flex flex-col gap-1">
			<div class="flex items-center gap-2">
				<span class="magi-banner-headline" style={gradientText}>Consensus reached</span>
				<span class="text-xs" aria-hidden="true">🔺🔻🔺</span>
			</div>
			<div class="h-0.5 w-full rounded-full" style={CONSENSUS_GRADIENT}></div>
		</div>
	{:else if verdict === 'split'}
		<div class="flex flex-col gap-1">
			<div class="flex items-center gap-2">
				<span class="magi-banner-headline magi-warn">Split decision</span>
				<span class="text-xs" aria-hidden="true">⚖️</span>
			</div>
			<p class="magi-banner-detail">
				{#if summary}No full consensus — {summary}.{:else}The MAGI did not fully agree — the
					differing positions are laid out below.{/if}
			</p>
			<div class="h-0.5 w-full rounded-full bg-amber-500/60"></div>
		</div>
	{/if}
{/snippet}

<div
	class="magi-panel flex h-full max-h-[70vh] flex-col overflow-hidden rounded-lg bg-gray-900/70 md:max-h-none {collapsed
		? 'min-h-0'
		: 'min-h-72'} {loading && allModelsResponded ? 'pulse-consensus' : ''}"
>
	<div class="h-0.5 shrink-0" style={gradientStyle}></div>
	<div class="flex shrink-0 flex-col gap-2 border-b border-gray-700 px-4 py-3">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<h3 class="text-sm font-bold text-white">MAGI CONSENSUS</h3>
				{#if consensusTemperament && consensusNodeApplies && consensusTempApplies}
					<span
						class="magi-temperament-badge rounded bg-gray-600/30 px-1.5 py-0.5 text-[10px] font-medium text-gray-300 ring-1 ring-gray-500/30"
						use:tooltip={TEMPERAMENT_TOOLTIPS[NODE_TEMPERAMENTS[consensusNode]]}
						>{TEMPERAMENT_LABELS[NODE_TEMPERAMENTS[consensusNode]]}</span
					>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if showTokens || showContext}
					<span class="flex items-center magi-numeric text-gray-500" use:tooltip={tokensTooltip}>
						{#if showContext && contextWindow}
							<span class={contextClass}
								>{formatTokenCount(contextUsed)}/{formatTokenCount(contextWindow)}</span
							>
						{:else}
							<TokenCount
								input={totalInput}
								output={totalOutput}
								cached={totalCached}
								estimated={liveEstimated}
							/>
						{/if}
					</span>
				{/if}
				{#if loading && !allModelsResponded}
					<div class="h-2 w-2 rounded-full bg-gray-600"></div>
				{:else if loading}
					<LoaderCircle size={14} class="animate-spin magi-pending" />
				{:else if hasConsensus}
					<div class="flex items-center gap-2">
						{#if fullText}
							<button
								class="text-gray-400 transition-colors hover:text-white"
								onclick={copyConsensus}
								title="Copy consensus"
							>
								{#if copied}
									<Check size={14} class="magi-success" />
								{:else}
									<Copy size={14} />
								{/if}
							</button>
						{/if}
						<CircleCheck size={14} class="magi-success" />
					</div>
				{:else}
					<div class="h-2 w-2 rounded-full bg-gray-600"></div>
				{/if}
			</div>
		</div>
		<div class="border-t border-gray-700"></div>
		<div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
				{#if onstrategychange}
					<span class="text-xs text-gray-500">Strategy</span>
					<StrategyPicker {strategy} {disabled} onchange={onstrategychange} />
					<span class="text-xs text-gray-700">·</span>
				{/if}
				{#if onconsensuschange}
					<span class="text-xs text-gray-500">Node</span>
					{#if consensusNodeApplies}
						<select
							class="magi-select rounded bg-gray-800 py-0.5 pr-6 pl-2 text-xs text-gray-300 focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:cursor-not-allowed"
							value={consensusNode}
							onchange={handleNodeChange}
							{disabled}
						>
							{#each MAGI_NODE_NAMES as node (node)}
								<option value={node}>{nodeLabels[node]}</option>
							{/each}
						</select>
					{:else}
						<!-- Voting tallies jurors in code — there's no consensus model
						     call to assign, so the dropdown shows "N/A" instead of a
						     stale selection. The original `consensusNode` state is kept
						     so it returns when the user switches back to Synthesis. -->
						<select
							class="magi-select rounded bg-gray-800 py-0.5 pr-6 pl-2 text-xs text-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:cursor-not-allowed"
							disabled
							title="Structured Voting has no consensus model — the winner is tallied from the juror scores and its response is shown verbatim, so no node synthesizes anything."
						>
							<option>N/A</option>
						</select>
					{/if}
				{/if}
				<!-- synthesisLabel names the model the consensus node would call —
				     also meaningless in voting, since there is no such call. -->
				{#if synthesisLabel && consensusNodeApplies}
					<span class="text-xs text-gray-400">{synthesisLabel}</span>
				{/if}
			</div>
			{#if onconsensustemperamentchange || onawarenesschange}
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-xs text-gray-500">Temperament</span>
					{#if onconsensustemperamentchange}
						<button
							type="button"
							class="magi-temperament-toggle flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors {consensusTemperament
								? 'magi-temperament-toggle-on bg-gray-600/30 text-gray-200 ring-1 ring-gray-500/50'
								: 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'} {consensusTempApplies
								? ''
								: 'cursor-not-allowed opacity-40'}"
							onclick={() =>
								consensusTempApplies && onconsensustemperamentchange(!consensusTemperament)}
							{disabled}
							aria-disabled={!consensusTempApplies}
							use:tooltip={!consensusTempApplies
								? 'Consensus temperament has no effect on Multi-Round Debate — the synthesizer is a neutral scribe. Use the main Temperaments toggle to make the debaters argue in-character.'
								: consensusTemperament
									? 'Consensus temperament active — synthesizer responds through its dispositional lens'
									: 'Enable consensus temperament — give the synthesizer its own dispositional personality'}
						>
							<Brain size={12} />
							{consensusTemperament ? 'ON' : 'OFF'}
						</button>
					{/if}
					{#if onawarenesschange}
						<button
							type="button"
							class="magi-temperament-toggle flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors {temperamentAwareness
								? 'magi-temperament-toggle-on bg-gray-600/30 text-gray-200 ring-1 ring-gray-500/50'
								: 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'} {awarenessApplies
								? ''
								: 'cursor-not-allowed opacity-40'}"
							onclick={() => awarenessApplies && onawarenesschange(!temperamentAwareness)}
							{disabled}
							aria-disabled={!awarenessApplies}
							use:tooltip={!awarenessApplies
								? strategy === 'debate'
									? 'Temperament awareness has no effect on Multi-Round Debate — the synthesizer is a neutral scribe; the lenses shape the debaters instead'
									: 'Temperament awareness has no effect on Structured Voting — each juror already scores through its own lens'
								: temperamentAwareness
									? 'Temperament awareness active — synthesizer considers dispositional lenses'
									: "Enable temperament awareness — tell the synthesizer about each node's dispositional lens"}
						>
							<Brain size={12} />
							Awareness {temperamentAwareness ? 'ON' : 'OFF'}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
	<div
		class="min-h-0 flex-1 overflow-y-auto"
		class:hidden={collapsed}
		bind:this={scrollEl}
		bind:clientHeight={viewportH}
		onscroll={onScroll}
	>
		<div class="flex flex-col gap-3 p-4" bind:this={contentEl}>
			{#if transcript.length === 0 && !liveQuery}
				<p class="magi-placeholder">Consensus will appear after all three MAGI respond</p>
			{:else}
				{#each transcript as turn, i (i)}
					<div
						class="flex flex-col gap-1.5 {i > 0
							? 'magi-turn-divider border-t border-gray-800 pt-3'
							: ''}"
					>
						<p class="text-xs font-medium text-gray-500">{turn.query}</p>
						{#if turn.consensus}
							{#if turn.strategy === 'debate'}{@render debateBanner(
									turn.debateVerdict,
									turn.debateSummary
								)}{/if}
							<div class="prose prose-sm max-w-none prose-invert">
								<Markdown source={turn.consensus} />
							</div>
						{:else}
							<p class="magi-placeholder">No consensus</p>
						{/if}
						{@render tokenFooter(turn.inputTokens, turn.outputTokens, false)}
					</div>
				{/each}
				{#if liveQuery}
					<div
						bind:this={liveTurnEl}
						class="flex flex-col gap-1.5 {transcript.length > 0
							? 'magi-turn-divider border-t border-gray-800 pt-3'
							: ''}"
					>
						<p class="text-xs font-medium text-gray-500">{liveQuery}</p>
						{#if warning}
							{@render warningCard(warning)}
						{/if}
						{#if loading && !allModelsResponded}
							<p class="animate-pulse text-sm text-gray-500">{waitingLabel}</p>
						{:else if loading && !text}
							<p class="magi-loader-text">{consensusLoadingText}…</p>
						{:else if text}
							{#if debateComplete}{@render debateBanner(debateVerdict, debateSummary)}{/if}
							<div class="prose prose-sm max-w-none prose-invert">
								<Markdown source={text} />
							</div>
							{#if debateRounding}
								<p class="magi-loader-text">{consensusLoadingText}…</p>
							{/if}
						{:else}
							<p class="magi-placeholder">Consensus will appear after all three MAGI respond</p>
						{/if}
						{@render tokenFooter(liveInput, liveOutput, liveEstimated)}
					</div>
				{/if}
			{/if}
			<!-- Tail spacer for snap mode: lets any element inside the live block
			     (round headings, the `---` divider, the streamed synthesis) scroll
			     to the top of the viewport regardless of how short the content is. -->
			{#if snapMinHeight}
				<div style:min-height={snapMinHeight} aria-hidden="true"></div>
			{/if}
		</div>
	</div>
</div>

<style>
	@keyframes pulse-consensus {
		0%,
		100% {
			box-shadow: inset 0 0 0 0 transparent;
			opacity: 0.7;
		}
		50% {
			/* Match the node panels' glow strength (20px blur, -4px spread) so the
			   consensus reads as bright as the three panels beside it. The red/blue
			   split keeps the consensus's own left↔right identity; green lives in
			   the top/bottom gradient bars below. */
			box-shadow:
				inset 18px 0 20px -4px #ef4444,
				inset -18px 0 20px -4px #3b82f6;
			opacity: 1;
		}
	}

	@keyframes pulse-top-glow {
		0%,
		100% {
			opacity: 0;
		}
		50% {
			opacity: 0.5;
		}
	}

	.pulse-consensus {
		position: relative;
		animation: pulse-consensus 2s ease-in-out infinite;
	}

	.pulse-consensus::before {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(to right, #ef4444, #34d399, #3b82f6);
		filter: blur(4px);
		pointer-events: none;
		animation: pulse-top-glow 2s ease-in-out infinite;
	}

	.pulse-consensus::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(to right, #ef4444, #34d399, #3b82f6);
		filter: blur(4px);
		pointer-events: none;
		animation: pulse-top-glow 2s ease-in-out infinite;
	}
</style>
