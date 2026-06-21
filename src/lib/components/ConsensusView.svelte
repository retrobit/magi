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
		loaderFrame,
		loaderCycleLength
	} from '$lib/magi/loading-verbs';
	import { tooltip } from '$lib/actions/tooltip';
	import { smoothSnap, prefersReducedMotion } from '$lib/motion';
	import Markdown from './Markdown.svelte';
	import StrategyPicker from './StrategyPicker.svelte';
	import VerdictPill from './VerdictPill.svelte';
	import TokenCount from './TokenCount.svelte';
	import CopyScopeButton, { type CopyScope } from './CopyScopeButton.svelte';
	import { LoaderCircle, CircleCheck, CircleHelp, AlertTriangle, Brain, Eye } from 'lucide-svelte';

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

	// The consensus seat plays a different role per strategy, so the chooser is
	// labelled to match: in Synthesis it *synthesizes* the three answers; in a
	// debate it *consolidates* the finished rounds. (Inert for voting/none.)
	const consensusSeatLabel = $derived(strategy === 'debate' ? 'Consolidator' : 'Synthesizer');
	const consensusSeatTooltip = $derived(
		strategy === 'debate'
			? 'The MAGI that consolidates the debate — after the rounds finish, it reads the full back-and-forth and writes the final unified answer.'
			: 'The MAGI that synthesizes the consensus — it reads all three answers and composes one unified result.'
	);

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

	// The query paired with whatever `copyTarget` points at — the live turn's
	// query while a finished turn is still in live state, the last committed
	// turn's query once it settles into the transcript.
	const copyQuery = $derived(liveQuery || transcript[transcript.length - 1]?.query || '');

	// Strategy-shaped copy scopes for the split copy button. The consensus is a
	// rigid Markdown skeleton we can slice on its SECTION_RULE (`---`) boundaries
	// (DEBATE_DIVIDER): a debate is `ledger ⟂ verdict ⟂ synthesis`, structured
	// voting is `tally ⟂ winner`, and a synthesis is one answer block. Each
	// strategy offers only the cuts that mean something for it; all keep `answer`
	// (the default) so a direct click on the icon always grabs the useful part.
	const copyScopes = $derived.by<CopyScope[]>(() => {
		const full = copyTarget;
		if (!full) return [];
		const query = copyQuery;
		const withQuery = (body: string) => (query && body ? `Query:\n${query}\n\n${body}` : '');

		if (strategy === 'debate') {
			const parts = full.split(DEBATE_DIVIDER);
			const structured = parts.length >= 3;
			const synthesis = structured ? parts.slice(2).join(DEBATE_DIVIDER) : full;
			const verdict = structured ? parts[1] : '';
			return [
				{ id: 'answer', label: 'Answer', content: synthesis },
				...(verdict ? [{ id: 'verdict', label: 'Verdict', content: verdict }] : []),
				{ id: 'queryAnswer', label: 'Query + answer', content: withQuery(synthesis) },
				...(structured
					? [{ id: 'everything', label: 'Everything (with rounds)', content: full }]
					: [])
			];
		}
		if (strategy === 'voting') {
			const parts = full.split(DEBATE_DIVIDER);
			const structured = parts.length >= 2;
			const winner = structured ? parts.slice(1).join(DEBATE_DIVIDER) : full;
			const tally = structured ? parts[0] : '';
			return [
				{ id: 'answer', label: 'Winning answer', content: winner },
				...(tally ? [{ id: 'tally', label: 'Vote tally', content: tally }] : []),
				{ id: 'queryAnswer', label: 'Query + answer', content: withQuery(winner) },
				...(structured
					? [{ id: 'everything', label: 'Everything (with tally)', content: full }]
					: [])
			];
		}
		// Synthesis (and any fallback): a single answer block, optionally with the query.
		return [
			{ id: 'answer', label: 'Answer', content: full },
			{ id: 'queryAnswer', label: 'Query + answer', content: withQuery(full) }
		];
	});

	// Static tooltips for the consensus Temperament / Awareness LABELS (not their
	// toggles) — purpose when the control applies, or why it's inert for the active
	// strategy. Static with respect to on/off so a mobile peek never has to flip
	// the toggle to read the tip.
	const consensusTempTip = $derived(
		consensusTempApplies
			? 'Consensus temperament — give the synthesizer its own dispositional lens.'
			: consensusSkipped
				? 'No consensus model runs in None mode — there is no synthesizer to give a temperament to.'
				: strategy === 'voting'
					? 'Consensus temperament has no effect on Structured Voting — the winner is a tally of juror scores judged on substance, not disposition.'
					: 'Consensus temperament has no effect on Multi-Round Debate — the synthesizer is a neutral scribe. Use the main Temperaments toggle to make the debaters argue in-character.'
	);
	const awarenessTip = $derived(
		awarenessApplies
			? "Temperament awareness — tell the synthesizer about each node's dispositional lens."
			: strategy === 'debate'
				? 'Temperament awareness has no effect on Multi-Round Debate — the synthesizer is a neutral scribe; the lenses shape the debaters instead.'
				: strategy === 'voting'
					? 'Temperament awareness has no effect on Structured Voting — voting jurors score neutrally on substance, so there is no synthesizer lens to shape.'
					: 'No consensus model runs in None mode — there is no synthesizer to be aware of node temperaments.'
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

	// Re-pin when the VIEWPORT's own height changes — e.g. the layout accordion
	// expanding this zone to full height on resolve. The content ResizeObserver
	// above only watches content height, so a viewport-only growth would otherwise
	// let the browser clamp scrollTop toward the top (the "pop to the top" on a
	// debate verdict). Reading viewportH keeps follow glued to the bottom through it.
	$effect(() => {
		void viewportH;
		if (scrollMode === 'follow' && pinned && scrollEl) {
			scrollEl.scrollTop = scrollEl.scrollHeight;
		}
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

	// Re-pin to the bottom when a turn COMMITS in follow mode. On commit the live
	// block is torn down and the finished turn re-mounts as a transcript entry that
	// Markdown renders in full at once — so the body can settle at the SAME net
	// height it held while streaming, and the content ResizeObserver never fires.
	// That left an earlier, shorter-content re-pin (from the live→committed gap) as
	// the final scroll position: the "pop toward the top" the moment a debate
	// resolved. Watch the committed-turn count and chase the bottom across a couple
	// of frames plus one tick past Markdown's ~100 ms throttle. The `-1` sentinel
	// makes the first run only seed the watermark, so a restored conversation never
	// yanks the view on mount.
	let prevTranscriptLen = -1;
	$effect(() => {
		const len = transcript.length;
		const prev = prevTranscriptLen;
		prevTranscriptLen = len;
		if (prev < 0 || len <= prev || scrollMode !== 'follow' || !scrollEl) return;
		pinned = true;
		const el = scrollEl;
		const toBottom = () => {
			if (scrollMode === 'follow' && pinned) el.scrollTop = el.scrollHeight;
		};
		requestAnimationFrame(() => requestAnimationFrame(toBottom));
		const t = setTimeout(toBottom, 140);
		return () => clearTimeout(t);
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
	let snappedVerdict = $state(false);
	$effect(() => {
		// Reset both watermarks on every new live turn (or when leaving snap mode).
		if (scrollMode !== 'snap' || !liveQuery) {
			lastSnappedRound = 0;
			snappedVerdict = false;
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

	// Snap mode + debate: when the round ledger resolves, the verdict line lands
	// framed by `---` rules. Snap its LEADING rule (the first `<hr>` — the boundary
	// between the ledger and the verdict) to the top, so the verdict itself is the
	// headline the reader lands on, with the synthesis answer streaming in below it.
	// The first `<hr>` is always the ledger↔verdict boundary regardless of whether
	// the synthesis divider has arrived yet. Mirrors the round-snap pattern: wait
	// for Markdown's throttled re-render to land the `<hr>`, scroll it to the top,
	// fire exactly once per turn.
	const hasVerdict = $derived(strategy === 'debate' && text.includes(DEBATE_DIVIDER));
	$effect(() => {
		if (scrollMode !== 'snap' || !liveQuery || collapsed) return;
		if (!hasVerdict || snappedVerdict) return;
		const el = scrollEl;
		const content = contentEl;
		if (!el || !content) return;
		const observer = new ResizeObserver(() => {
			const hr = content.querySelector('hr');
			if (!hr) return;
			smoothSnap(
				el,
				el.scrollTop + hr.getBoundingClientRect().top - el.getBoundingClientRect().top - 8
			);
			snappedVerdict = true;
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
	// Reduced motion freezes the sweep on the plain verb — a JS interval can't be
	// stopped by CSS, so we gate it here. Captured per loader phase.
	let cStaticVerb = $state(false);
	// The active verb (ellipsis included) being written/overwritten by the block.
	const consensusLoadingText = $derived(
		loaderFrame(consensusVerbs, cVerbIndex, cSweep, cStaticVerb)
	);
	$effect(() => {
		if (!showConsensusLoader) return;
		cVerbIndex = 0;
		cSweep = 0;
		cStaticVerb = prefersReducedMotion();
		if (cStaticVerb) return; // honor reduced motion: no animated sweep
		const id = setInterval(() => {
			if (cSweep + 1 >= loaderCycleLength(consensusVerbs, cVerbIndex)) {
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

	// The model label is `truncate`d; only offer a tooltip when it's actually cut
	// off (so it's a peek-the-full-name affordance, not redundant chrome). Measure
	// scrollWidth vs clientWidth on label change and on resize.
	let synthLabelEl = $state<HTMLSpanElement>();
	let synthLabelTruncated = $state(false);
	$effect(() => {
		void synthesisLabel;
		const el = synthLabelEl;
		if (!el) return;
		const check = () => (synthLabelTruncated = el.scrollWidth > el.clientWidth + 1);
		check();
		const ro = new ResizeObserver(check);
		ro.observe(el);
		return () => ro.disconnect();
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
						class="magi-temperament-badge rounded px-1.5 py-0.5 magi-chip"
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
					<span
						class="flex items-center magi-numeric text-(--magi-text-faint)"
						use:tooltip={tokensTooltip}
					>
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
					<div class="h-2 w-2 rounded-full bg-(--magi-text-faint)"></div>
				{:else if loading}
					<LoaderCircle size={14} class="animate-spin magi-pending" />
				{:else if hasConsensus}
					<div class="flex items-center gap-2">
						{#if copyScopes.length > 0}
							<CopyScopeButton defaultId="answer" scopes={copyScopes} title="Copy consensus" />
						{/if}
						{#if lastTurnAborted}
							<!-- Aborted turn — response was truncated, not a clean completion. -->
							<CircleHelp size={14} class="magi-unknown" />
						{:else}
							<CircleCheck size={14} class="magi-success" />
						{/if}
					</div>
				{:else}
					<div class="h-2 w-2 rounded-full bg-(--magi-text-faint)"></div>
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
						<span class="text-xs text-(--magi-text-muted) uppercase">Strategy</span>
						<StrategyPicker {strategy} {disabled} onchange={onstrategychange} />
					</div>
					<span class="hidden text-xs text-(--magi-text-faint) sm:inline">·</span>
					<!-- Rounds picker — the debate round ceiling. Debate-only; the debate
					     may still converge before the limit, so it's a maximum. -->
					{#if strategy === 'debate' && ondebateroundschange}
						<div class="flex items-center gap-x-2">
							<span
								class="text-xs text-(--magi-text-muted) uppercase"
								use:tooltip={'Maximum debate rounds — the MAGI may converge and finish sooner'}
								>Rounds</span
							>
							<select
								class="magi-select focus:ring-1 focus:ring-(--magi-ring) focus:outline-none"
								value={debateRounds}
								onchange={handleRoundsChange}
								{disabled}
							>
								{#each DEBATE_ROUND_OPTIONS as n (n)}
									<option value={n}>{n}</option>
								{/each}
							</select>
						</div>
						<span class="hidden text-xs text-(--magi-text-faint) sm:inline">·</span>
					{/if}
				{/if}
				{#if onconsensuschange || (synthesisLabel && consensusNodeApplies)}
					<div class="flex w-full items-center gap-x-2 sm:contents">
						{#if onconsensuschange}
							<div class="flex shrink-0 items-center gap-x-2">
								<span
									class="text-xs text-(--magi-text-muted) uppercase"
									use:tooltip={consensusSeatTooltip}>{consensusSeatLabel}</span
								>
								{#if consensusNodeApplies}
									<select
										class="magi-select focus:ring-1 focus:ring-(--magi-ring) focus:outline-none"
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
										class="magi-select text-(--magi-text-faint) focus:ring-1 focus:ring-(--magi-ring) focus:outline-none"
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
								bind:this={synthLabelEl}
								class="min-w-0 truncate text-xs text-(--magi-text-muted)"
								use:tooltip={synthLabelTruncated ? synthesisLabel : undefined}
								>{synthesisLabel}</span
							>
						{/if}
					</div>
				{/if}
			</div>
			{#if onconsensustemperamentchange || onawarenesschange}
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					{#if onconsensustemperamentchange}
						<div class="flex items-center gap-1.5">
							<span
								class="text-xs text-(--magi-text-muted) uppercase"
								use:tooltip={consensusTempTip}>Temperament</span
							>
							<button
								type="button"
								class="magi-toggle {consensusTemperament ? 'magi-toggle-on' : ''}"
								onclick={() =>
									!disabled &&
									consensusTempApplies &&
									onconsensustemperamentchange(!consensusTemperament)}
								aria-pressed={consensusTemperament}
								aria-disabled={disabled || !consensusTempApplies}
								aria-label="Consensus temperament {consensusTemperament ? 'on' : 'off'}"
							>
								<Brain size={12} />
								<span class="inline-block w-7 text-left">{consensusTemperament ? 'ON' : 'OFF'}</span
								>
							</button>
						</div>
					{/if}
					{#if onawarenesschange}
						<div class="flex items-center gap-1.5">
							<span class="text-xs text-(--magi-text-muted) uppercase" use:tooltip={awarenessTip}
								>Awareness</span
							>
							<button
								type="button"
								class="magi-toggle {temperamentAwareness ? 'magi-toggle-on' : ''}"
								onclick={() =>
									!disabled && awarenessApplies && onawarenesschange(!temperamentAwareness)}
								aria-pressed={temperamentAwareness}
								aria-disabled={disabled || !awarenessApplies}
								aria-label="Temperament awareness {temperamentAwareness ? 'on' : 'off'}"
							>
								<Eye size={12} />
								<span class="inline-block w-7 text-left">{temperamentAwareness ? 'ON' : 'OFF'}</span
								>
							</button>
						</div>
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
							<p class="magi-loader-text">{consensusLoadingText}</p>
						{:else if text}
							<div class="prose max-w-none prose-invert">
								<Markdown source={text} />
							</div>
							{#if debateRounding}
								<p class="magi-loader-text">{consensusLoadingText}</p>
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
