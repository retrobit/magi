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
		contextUsageClass,
		formatTokenCount,
		tokenUsageTooltip,
		getProviderLabel,
		isRouter
	} from '$lib/magi/types';
	import { type StrategyName, DEBATE_ROUND_OPTIONS } from '$lib/magi/consensus';
	import {
		STRATEGY_VERBS,
		GENERIC_VERBS,
		SWEEP_MS,
		sweepVerb,
		sweepCycleLength
	} from '$lib/magi/loading-verbs';
	import { tooltip } from '$lib/actions/tooltip';
	import { smoothSnap } from '$lib/motion';
	import Markdown from './Markdown.svelte';
	import StrategyPicker from './StrategyPicker.svelte';
	import VerdictPill from './VerdictPill.svelte';
	import TokenCount from './TokenCount.svelte';
	import {
		Copy,
		Check,
		LoaderCircle,
		CircleCheck,
		CircleHelp,
		AlertTriangle,
		Brain
	} from 'lucide-svelte';

	let copied = $state(false);
	function copyConsensus() {
		if (!copyTarget) return;
		navigator.clipboard.writeText(copyTarget).catch(() => {});
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
		/** Multi-Round Debate round ceiling — drives the "Rounds" picker (debate only). */
		debateRounds?: number;
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
		/** Fires when the Rounds picker changes the debate round ceiling. */
		ondebateroundschange?: (rounds: number) => void;
		/** Fills the main query input with an example prompt (never submits). */
		onexampleselect?: (prompt: string) => void;
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
		debateRounds = 3,
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
		ondebateroundschange,
		onexampleselect,
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

	// Consensus temperament lenses the synthesizer (Synthesis only). It's inert
	// everywhere else: Debate's synthesizer is a neutral scribe (lenses live in the
	// debaters), Voting's jurors are told to judge substance objectively (a
	// dispositional lens would bias the tally), and `none` runs no consensus call.
	const consensusTempApplies = $derived(strategy === 'synthesis');

	// Voting tallies all jurors equally; there's no single consensus node, so
	// both the Node dropdown and the consensus-temperament badge are inert.
	// `none` also has no consensus call, so the same gate applies.
	const consensusNodeApplies = $derived(strategy !== 'voting' && strategy !== 'none');

	// Convenience flag for the placeholder / loader logic below.
	const consensusSkipped = $derived(strategy === 'none');

	// Single source of truth for the None-strategy placeholder — avoids the
	// verbatim duplication that existed at the live-turn and transcript sites.
	const NONE_STRATEGY_PLACEHOLDER =
		'Strategy: None — consensus skipped. The three responses above stand on their own.';

	// A consensus exists if it's streaming live or was committed to the transcript.
	// Lets the header's done-check (and the debate banner) survive the live-state
	// reset that fires when a turn commits.
	const lastTurnConsensusText = $derived(transcript[transcript.length - 1]?.consensus ?? '');
	const lastTurnConsensus = $derived(!!lastTurnConsensusText);
	const hasConsensus = $derived(text !== '' || lastTurnConsensus);
	// Aborted turns: the last committed turn was stopped mid-stream — suppress
	// the green check and show a neutral icon instead.
	const lastTurnAborted = $derived(transcript[transcript.length - 1]?.aborted ?? false);
	// What the copy button actually writes to the clipboard. `fullText` is the
	// live-state final, which is reset to '' when a turn commits to the
	// transcript — so without the transcript fallback the button would only
	// appear in the brief post-stream / pre-commit window.
	const copyTarget = $derived(fullText || lastTurnConsensusText);

	// A finished debate earns a headline banner — the rounds are done and a final
	// synthesis is on screen. Gradient-clipped text reuses the three-MAGI triad.
	const debateComplete = $derived(strategy === 'debate' && !loading && text !== '');

	// Header verdict badge — a glanceable, auto-scroll-independent label of the
	// debate outcome that lives in the panel header (always visible, unlike the
	// in-stream callout). Shows the live verdict the instant a debate completes,
	// then the last committed debate turn's verdict once the live turn settles.
	// Nothing during a fresh debate's streaming (never a stale outcome), for
	// non-debate turns, or for a walkover.
	const headerVerdict = $derived(
		debateComplete
			? debateVerdict
			: !liveQuery && transcript[transcript.length - 1]?.strategy === 'debate'
				? transcript[transcript.length - 1]?.debateVerdict
				: undefined
	);
	// The coalition shape behind a split verdict, paired with `headerVerdict` so the
	// header badge's tooltip can name who aligned against whom.
	const headerSummary = $derived(
		debateComplete
			? debateSummary
			: !liveQuery && transcript[transcript.length - 1]?.strategy === 'debate'
				? transcript[transcript.length - 1]?.debateSummary
				: undefined
	);

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

	// Example prompts shown on the idle screen — short ones that fit chips.
	const EXAMPLE_PROMPTS = [
		'Is free will an illusion?',
		'Why do we dream?',
		'Is mathematics discovered or invented?'
	];

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

	// Re-engage follow at the start of each new live turn. A manual scroll-up while
	// reading a previous turn leaves `pinned` false; without this, follow would
	// stay paused for the next turn and never track the new consensus.
	let prevLiveQuery = '';
	$effect(() => {
		if (liveQuery && liveQuery !== prevLiveQuery) pinned = true;
		prevLiveQuery = liveQuery;
	});

	// Complement the ResizeObserver: when the streamed consensus text changes, also
	// follow on the next frames. The consensus body is re-rendered (not just grown)
	// as Markdown re-parses the whole source each chunk, and a full re-render can
	// settle without a net height delta the observer would catch — so nudge directly.
	$effect(() => {
		void text;
		void fullText;
		if (scrollMode !== 'follow' || !pinned || !scrollEl) return;
		const el = scrollEl;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				if (scrollMode === 'follow' && pinned) el.scrollTop = el.scrollHeight;
			})
		);
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
				smoothSnap(
					el,
					el.scrollTop + target.getBoundingClientRect().top - el.getBoundingClientRect().top - 8
				);
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
				smoothSnap(
					el,
					el.scrollTop + target.getBoundingClientRect().top - el.getBoundingClientRect().top - 8
				);
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
			smoothSnap(
				el,
				el.scrollTop + hr.getBoundingClientRect().top - el.getBoundingClientRect().top - 8
			);
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
	// nodes have responded). The verb list leans into the active strategy. `none`
	// never reaches the loader (we short-circuit to the placeholder above), but
	// fall back to GENERIC_VERBS so the index access stays defined.
	const consensusVerbs = $derived(strategy === 'none' ? GENERIC_VERBS : STRATEGY_VERBS[strategy]);
	let cVerbIndex = $state(0);
	let cSweep = $state(0);
	// The block overwrites the previous verb; the first verb writes onto blank.
	const cPrevVerb = $derived(
		cVerbIndex === 0 ? '' : consensusVerbs[(cVerbIndex - 1) % consensusVerbs.length]
	);
	// Trim the to-be-filled padding off the end so the trailing "…" hugs the live
	// text instead of floating past blank space.
	const consensusLoadingText = $derived(
		sweepVerb(consensusVerbs[cVerbIndex % consensusVerbs.length], cSweep, cPrevVerb).trimEnd()
	);
	$effect(() => {
		if (!showConsensusLoader) return;
		cVerbIndex = 0;
		cSweep = 0;
		const id = setInterval(() => {
			const word = consensusVerbs[cVerbIndex % consensusVerbs.length];
			const prev = cVerbIndex === 0 ? '' : consensusVerbs[(cVerbIndex - 1) % consensusVerbs.length];
			if (cSweep + 1 >= sweepCycleLength(word, prev)) {
				cSweep = 0;
				cVerbIndex += 1;
			} else {
				cSweep += 1;
			}
		}, SWEEP_MS);
		return () => clearInterval(id);
	});

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

	function handleRoundsChange(e: Event) {
		ondebateroundschange?.(Number((e.target as HTMLSelectElement).value));
	}
</script>

{#snippet tokenFooter(input: number, output: number, estimated: boolean)}
	{#if input > 0 || output > 0}
		<p class="magi-token-split magi-numeric">
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

<div
	class="magi-panel flex h-full max-h-[70vh] flex-col overflow-hidden rounded-lg md:max-h-none {collapsed
		? 'min-h-0'
		: 'min-h-72 md:min-h-0'} {loading && allModelsResponded ? 'pulse-consensus' : ''}"
>
	{#if loading && allModelsResponded}
		<!-- Static side-glow overlay; only its opacity animates (see <style>). -->
		<div class="consensus-glow" aria-hidden="true"></div>
	{/if}
	<div class="h-0.5 shrink-0" style="background: var(--magi-consensus-gradient)"></div>
	<div class="flex shrink-0 flex-col gap-2 border-b magi-divider px-4 py-3">
		<div class="relative flex items-center justify-between select-none">
			<div class="flex items-center gap-2">
				<h3 class="magi-display text-base font-bold tracking-widest text-(--magi-text)">
					MAGI CONSENSUS
				</h3>
				{#if consensusTemperament && consensusNodeApplies && consensusTempApplies}
					<span
						class="magi-temperament-badge rounded bg-gray-600/30 px-1.5 py-0.5 magi-chip ring-1 ring-gray-500/30"
						use:tooltip={TEMPERAMENT_TOOLTIPS[NODE_TEMPERAMENTS[consensusNode]]}
						>{TEMPERAMENT_LABELS[NODE_TEMPERAMENTS[consensusNode]]}</span
					>
				{/if}
			</div>
			<!-- Debate verdict at a glance — centred in the header so it's readable no
			     matter the auto-scroll position, separate from the in-stream callout.
			     Absolutely centred (pointer-events pass through the wrapper) so the
			     title and token readout keep their edges. -->
			{#if headerVerdict === 'consensus' || headerVerdict === 'split'}
				<div
					class="pointer-events-none absolute inset-0 flex items-center justify-center"
					aria-hidden="false"
				>
					{#if headerVerdict === 'consensus'}
						<VerdictPill
							verdict="consensus"
							tooltipText="The MAGI converged — they reached consensus."
						/>
					{:else}
						<VerdictPill
							verdict="split"
							tooltipText={headerSummary
								? `No full consensus — ${headerSummary}. The positions are laid out in the answer.`
								: 'The MAGI did not fully agree — the positions are laid out in the answer.'}
						/>
					{/if}
				</div>
			{/if}
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
						{#if copyTarget}
							<button
								class="text-(--magi-text-muted) transition-colors hover:text-(--magi-text)"
								onclick={copyConsensus}
								aria-label={copied ? 'Copied' : 'Copy consensus'}
								use:tooltip={'Copy consensus'}
							>
								{#if copied}
									<Check size={14} class="magi-success" />
								{:else}
									<Copy size={14} />
								{/if}
							</button>
						{/if}
						{#if lastTurnAborted}
							<!-- Aborted turn — response was truncated, not a clean completion. -->
							<CircleHelp size={14} class="magi-unknown" />
						{:else}
							<CircleCheck size={14} class="magi-success" />
						{/if}
					</div>
				{:else}
					<div class="h-2 w-2 rounded-full bg-gray-600"></div>
				{/if}
			</div>
		</div>
		<div class="-mx-4 border-t magi-divider"></div>
		<!-- Mobile: stack Strategy/Node/Model on their own row above
		     Temperament/Awareness. sm+: side-by-side, wrap as needed. -->
		<div
			class="flex flex-col items-start gap-y-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-2 sm:gap-y-1"
		>
			<!-- Mobile: Strategy on its own line, Node + Model share line 2 (Model
			     truncates with an ellipsis if the synth name is too long, with a
			     touch/hover tooltip surfacing the full string). sm+: inline with
			     a dot separator between Strategy and Node. -->
			<div
				class="flex w-full flex-col items-start gap-y-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1"
			>
				{#if onstrategychange}
					<div class="flex items-center gap-x-2">
						<span class="text-xs text-gray-500">Strategy</span>
						<StrategyPicker {strategy} {disabled} onchange={onstrategychange} />
					</div>
					<span class="hidden text-xs text-gray-700 sm:inline">·</span>
					<!-- Rounds picker — the debate round ceiling. Debate-only; the debate
					     may still converge before the limit, so it's a maximum. -->
					{#if strategy === 'debate' && ondebateroundschange}
						<div class="flex items-center gap-x-2">
							<span class="text-xs text-gray-500">Rounds</span>
							<select
								class="magi-select rounded py-0.5 pr-6 pl-2 text-xs focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:cursor-not-allowed"
								value={debateRounds}
								onchange={handleRoundsChange}
								{disabled}
								use:tooltip={'Maximum debate rounds — the MAGI may converge and finish sooner'}
							>
								{#each DEBATE_ROUND_OPTIONS as n (n)}
									<option value={n}>{n}</option>
								{/each}
							</select>
						</div>
						<span class="hidden text-xs text-gray-700 sm:inline">·</span>
					{/if}
				{/if}
				{#if onconsensuschange || (synthesisLabel && consensusNodeApplies)}
					<div class="flex w-full items-center gap-x-2 sm:contents">
						{#if onconsensuschange}
							<div class="flex shrink-0 items-center gap-x-2">
								<span class="text-xs text-gray-500">Node</span>
								{#if consensusNodeApplies}
									<select
										class="magi-select rounded py-0.5 pr-6 pl-2 text-xs focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:cursor-not-allowed"
										value={consensusNode}
										onchange={handleNodeChange}
										{disabled}
									>
										{#each MAGI_NODE_NAMES as node (node)}
											<option value={node}>{nodeLabels[node]}</option>
										{/each}
									</select>
								{:else}
									<!-- Voting tallies jurors in code, None skips consensus
									     entirely — neither has a consensus model call to assign,
									     so the dropdown shows "N/A" instead of a stale selection.
									     The original `consensusNode` state is kept so it returns
									     when the user switches back to Synthesis. -->
									<select
										class="magi-select rounded py-0.5 pr-6 pl-2 text-xs text-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:cursor-not-allowed"
										disabled
										title={consensusSkipped
											? 'No consensus is computed in None mode — the three model responses stand on their own, so there is no node to assign.'
											: 'Structured Voting has no consensus model — the winner is tallied from the juror scores and its response is shown verbatim, so no node synthesizes anything.'}
									>
										<option>N/A</option>
									</select>
								{/if}
							</div>
						{/if}
						<!-- synthesisLabel names the model the consensus node would call —
						     also meaningless in voting, since there is no such call. -->
						{#if synthesisLabel && consensusNodeApplies}
							<span
								class="min-w-0 truncate text-xs text-(--magi-text-muted)"
								use:tooltip={synthesisLabel}>{synthesisLabel}</span
							>
						{/if}
					</div>
				{/if}
			</div>
			{#if onconsensustemperamentchange || onawarenesschange}
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-xs text-gray-500">Temperament</span>
					{#if onconsensustemperamentchange}
						<button
							type="button"
							class="magi-temperament-toggle flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors {consensusTemperament
								? 'magi-temperament-toggle-on ring-1 ring-gray-500/50'
								: ''} {consensusTempApplies && !disabled ? '' : 'cursor-not-allowed opacity-40'}"
							onclick={() =>
								!disabled &&
								consensusTempApplies &&
								onconsensustemperamentchange(!consensusTemperament)}
							aria-pressed={consensusTemperament}
							aria-disabled={disabled || !consensusTempApplies}
							use:tooltip={!consensusTempApplies
								? consensusSkipped
									? 'No consensus model runs in None mode — there is no synthesizer to give a temperament to.'
									: strategy === 'voting'
										? 'Consensus temperament has no effect on Structured Voting — the winner is a tally of juror scores judged on substance, not disposition.'
										: 'Consensus temperament has no effect on Multi-Round Debate — the synthesizer is a neutral scribe. Use the main Temperaments toggle to make the debaters argue in-character.'
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
								? 'magi-temperament-toggle-on ring-1 ring-gray-500/50'
								: ''} {awarenessApplies && !disabled ? '' : 'cursor-not-allowed opacity-40'}"
							onclick={() =>
								!disabled && awarenessApplies && onawarenesschange(!temperamentAwareness)}
							aria-pressed={temperamentAwareness}
							aria-disabled={disabled || !awarenessApplies}
							use:tooltip={!awarenessApplies
								? strategy === 'debate'
									? 'Temperament awareness has no effect on Multi-Round Debate — the synthesizer is a neutral scribe; the lenses shape the debaters instead'
									: strategy === 'voting'
										? 'Temperament awareness has no effect on Structured Voting — voting jurors score neutrally on substance, so there is no synthesizer lens to shape'
										: 'No consensus model runs in None mode — there is no synthesizer to be aware of node temperaments.'
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
		class="magi-output min-h-0 flex-1 overflow-y-auto"
		class:hidden={collapsed}
		bind:this={scrollEl}
		bind:clientHeight={viewportH}
		onscroll={onScroll}
	>
		<div class="flex flex-col gap-3 p-4" bind:this={contentEl}>
			{#if transcript.length === 0 && !liveQuery}
				<div class="flex flex-col gap-3">
					<p class="magi-placeholder">
						One question, three minds. MAGI sends your query to three different models in parallel,
						then merges their answers into a single consensus.
					</p>
					{#if onexampleselect}
						<div class="flex flex-wrap gap-2">
							{#each EXAMPLE_PROMPTS as prompt (prompt)}
								<button
									type="button"
									class="magi-newconv-btn rounded-full px-3 py-1 text-xs transition-colors"
									onclick={() => onexampleselect(prompt)}
								>
									{prompt}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				{#each transcript as turn, i (i)}
					<div class="flex flex-col gap-1.5 {i > 0 ? 'magi-turn-divider border-t pt-3' : ''}">
						<p class="text-xs font-medium text-(--magi-text-muted)">{turn.query}</p>
						{#if turn.consensusWarning}
							<!-- Amber strip: consensus ran but on fewer than all three MAGI.
							     Displayed verbatim from the server-produced warning string. -->
							<p class="flex items-center gap-1.5 text-xs magi-warn">
								<AlertTriangle size={12} class="shrink-0" />
								{turn.consensusWarning}
							</p>
						{/if}
						{#if turn.consensus}
							<div class="prose max-w-none prose-invert">
								<Markdown source={turn.consensus} />
							</div>
							{#if turn.aborted}
								<p class="text-xs magi-unknown">Stopped — response truncated.</p>
							{/if}
						{:else if turn.strategy === 'none'}
							{#if (turn.respondedCount ?? 0) > 0}
								<p class="magi-placeholder">{NONE_STRATEGY_PLACEHOLDER}</p>
							{:else}
								<p class="magi-placeholder">No consensus computed — no MAGI responded this turn.</p>
							{/if}
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
							? 'magi-turn-divider border-t pt-3'
							: ''}"
					>
						<p class="text-xs font-medium text-(--magi-text-muted)">{liveQuery}</p>
						{#if warning}
							{@render warningCard(warning)}
						{/if}
						{#if consensusSkipped && allModelsResponded}
							<!-- `none` strategy: the server skipped phase 2 entirely, so
							     no consensus events ever arrive. Once all three responses
							     are in, settle into the placeholder rather than waiting
							     forever on a synthesis that won't come. Gate the cheerful
							     copy on at least one actual success — erroredCount only
							     pushes allModelsResponded over the line, so three failures
							     should not read as "stand on their own". -->
							{#if respondedCount > 0}
								<p class="magi-placeholder">{NONE_STRATEGY_PLACEHOLDER}</p>
							{:else}
								<p class="magi-placeholder">No consensus computed — no MAGI responded this turn.</p>
							{/if}
						{:else if loading && !allModelsResponded}
							<p class="animate-pulse text-sm text-(--magi-text-faint) motion-reduce:animate-none">
								{waitingLabel}
							</p>
						{:else if loading && !text}
							<p class="magi-loader-text">{consensusLoadingText}…</p>
						{:else if text}
							<div class="prose max-w-none prose-invert">
								<Markdown source={text} />
							</div>
							{#if debateRounding}
								<p class="magi-loader-text">{consensusLoadingText}…</p>
							{/if}
						{:else}
							<p class="magi-placeholder">Consensus pending — awaiting MAGI responses…</p>
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
	/* Pending glow. Like the node panels, the side glows are a STATIC inset
	   box-shadow on a dedicated overlay element (.consensus-glow); only its
	   opacity animates, which the compositor handles without re-rasterizing the
	   shadow every frame. Animating box-shadow directly stuttered against the
	   consensus markdown streaming into this same panel. isolate + z-index:-1
	   keeps the glow above the panel background but behind content. The top/bottom
	   gradient bars (::before/::after) already animate only opacity. */
	@keyframes pulse-consensus {
		0%,
		100% {
			opacity: 0;
		}
		50% {
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
		isolation: isolate;
	}

	.consensus-glow {
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: inherit;
		/* Softer than the node panels' all-sides glow — two side glows would
		   otherwise outweigh any single node. Red/blue keep the left↔right
		   identity; green lives in the top/bottom bars below. */
		box-shadow:
			inset 10px 0 14px -6px var(--magi-node-red),
			inset -10px 0 14px -6px var(--magi-node-blue);
		opacity: 0;
		pointer-events: none;
		will-change: opacity;
		animation: pulse-consensus 2s ease-in-out infinite;
	}

	.pulse-consensus::before {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: var(--magi-consensus-gradient);
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
		background: var(--magi-consensus-gradient);
		filter: blur(4px);
		pointer-events: none;
		animation: pulse-top-glow 2s ease-in-out infinite;
	}

	/* Hold the consensus glow still when motion is reduced (OS preference or the
	   in-app setting's class on <html>). */
	@media (prefers-reduced-motion: reduce) {
		.consensus-glow,
		.pulse-consensus::before,
		.pulse-consensus::after {
			animation: none;
		}
	}
	:global(.reduce-motion) .consensus-glow,
	:global(.reduce-motion) .pulse-consensus::before,
	:global(.reduce-motion) .pulse-consensus::after {
		animation: none;
	}
</style>
