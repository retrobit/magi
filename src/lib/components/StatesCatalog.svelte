<script lang="ts">
	// Dev-only visual catalog of every transient status/result/progress indicator
	// the app can show. These states are hard to reproduce deterministically while
	// driving (they need specific debate outcomes, failures, or timing), so this
	// enumerates them in one place. Opened from the Debug panel.
	import {
		MAGI_NODE_NAMES,
		NODE_COLOR_VARS,
		NODE_LABELS,
		NODE_LABELS_GENERIC
	} from '$lib/magi/types';
	import { SECTION_RULE } from '$lib/magi/consensus/types';
	import { debateVerdictLine } from '$lib/magi/consensus/debate';
	import {
		GENERIC_VERBS,
		STRATEGY_VERBS,
		SWEEP_MS,
		sweepVerb,
		sweepCycleLength
	} from '$lib/magi/loading-verbs';
	import Markdown from './Markdown.svelte';
	import VerdictPill from './VerdictPill.svelte';
	import {
		LoaderCircle,
		CircleCheck,
		CircleHelp,
		CircleAlert,
		AlertTriangle,
		ChevronRight,
		X
	} from 'lucide-svelte';

	interface Props {
		genericLabels?: boolean;
		onclose: () => void;
	}

	let { genericLabels = false, onclose }: Props = $props();

	const nodeLabels = $derived(genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS);

	// Live sweeping verb — the real node/consensus loading-progress animation, so
	// the catalog shows the actual motion rather than a frozen frame.
	const nodeVerbs = GENERIC_VERBS;
	const consensusVerbs = STRATEGY_VERBS.debate;
	let nVerb = $state(0);
	let nSweep = $state(0);
	let cVerb = $state(0);
	let cSweep = $state(0);
	const nodeLoadingText = $derived(sweepVerb(nodeVerbs[nVerb % nodeVerbs.length], nSweep));
	const consensusLoadingText = $derived(
		sweepVerb(consensusVerbs[cVerb % consensusVerbs.length], cSweep)
	);
	$effect(() => {
		const id = setInterval(() => {
			const nw = nodeVerbs[nVerb % nodeVerbs.length];
			if (nSweep + 1 >= sweepCycleLength(nw)) {
				nSweep = 0;
				nVerb += 1;
			} else nSweep += 1;
			const cw = consensusVerbs[cVerb % consensusVerbs.length];
			if (cSweep + 1 >= sweepCycleLength(cw)) {
				cSweep = 0;
				cVerb += 1;
			} else cSweep += 1;
		}, SWEEP_MS);
		return () => clearInterval(id);
	});

	// Every debate verdict status line, enumerated via the same pure builder the
	// runtime uses — so this list can never drift from what a real debate emits.
	const sampleSummary = $derived(
		`${nodeLabels.MAGI_1} & ${nodeLabels.MAGI_2} aligned; ${nodeLabels.MAGI_3} dissents`
	);
	const verdictMessages = $derived([
		{
			caption: 'Consensus — converged before the limit',
			line: debateVerdictLine({ verdict: 'consensus', hitLimit: false, round: 2, maxRounds: 3 })
		},
		{
			caption: 'Consensus — reached the round limit',
			line: debateVerdictLine({ verdict: 'consensus', hitLimit: true, round: 4, maxRounds: 3 })
		},
		{
			caption: 'Split — stabilized early (no MAGI changed), still divided',
			line: debateVerdictLine({
				verdict: 'split',
				hitLimit: false,
				round: 2,
				maxRounds: 3,
				summary: sampleSummary
			})
		},
		{
			caption: 'Split — reached the round limit',
			line: debateVerdictLine({
				verdict: 'split',
				hitLimit: true,
				round: 4,
				maxRounds: 3,
				summary: sampleSummary
			})
		}
	]);
	// Walkover emits an inline note (no framed banner) — shown verbatim for parity.
	const walkoverNote = $derived(`Only ${nodeLabels.MAGI_1} responded — no debate was held.`);
</script>

<div class="flex max-h-[80vh] w-full flex-col magi-popover">
	<div class="flex shrink-0 items-center justify-between border-b magi-divider p-3">
		<span class="flex items-center gap-1.5 magi-section-header magi-warn">
			<CircleHelp size={13} /> STATES CATALOG · dev only
		</span>
		<button
			type="button"
			class="text-gray-500 transition-colors hover:text-(--magi-text)"
			onclick={onclose}
			aria-label="Close states catalog"
		>
			<X size={14} />
		</button>
	</div>

	<div class="flex flex-col gap-5 overflow-y-auto p-4">
		<p class="magi-meta">
			Every transient status, result, and progress indicator — enumerated so they can be eyeballed
			without driving the exact conditions that trigger them.
		</p>

		<!-- ── Node / consensus status icons ── -->
		<section class="flex flex-col gap-2">
			<span class="magi-section-header text-gray-500">Status icons</span>
			<div class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
				<div class="flex items-center gap-2">
					<div class="h-2 w-2 rounded-full bg-gray-600"></div>
					<span class="magi-meta">Idle — awaiting query</span>
				</div>
				<div class="flex items-center gap-2">
					<LoaderCircle size={14} class="animate-spin magi-pending" />
					<span class="magi-meta">Pending — in flight</span>
				</div>
				<div class="flex items-center gap-2">
					<CircleCheck size={14} class="magi-success" />
					<span class="magi-meta">Success</span>
				</div>
				<div class="flex items-center gap-2">
					<X size={14} class="magi-error" />
					<span class="magi-meta">Node error</span>
				</div>
				<div class="flex items-center gap-2">
					<CircleHelp size={14} class="magi-unknown" />
					<span class="magi-meta">Unknown — stream ended early</span>
				</div>
				<div class="flex items-center gap-2">
					<CircleCheck size={14} class="magi-success" />
					<span class="magi-meta">Consensus ready</span>
				</div>
			</div>
		</section>

		<!-- ── Result indicators (header verdict pills) ── -->
		<section class="flex flex-col gap-2">
			<span class="magi-section-header text-gray-500">Result indicators</span>
			<div class="flex flex-wrap items-center gap-4">
				<div class="flex items-center gap-2">
					<VerdictPill verdict="consensus" />
					<span class="magi-meta">Debate converged</span>
				</div>
				<div class="flex items-center gap-2">
					<VerdictPill verdict="split" />
					<span class="magi-meta">Debate split</span>
				</div>
			</div>
		</section>

		<!-- ── Round indicators (per-node pills) ── -->
		<section class="flex flex-col gap-2">
			<span class="magi-section-header text-gray-500">Round indicators</span>
			<div class="flex flex-col gap-0.5">
				<div class="flex flex-wrap items-center gap-3">
					{#each MAGI_NODE_NAMES as node, i (node)}
						<span
							class="inline-flex w-fit items-center gap-1 rounded-full border border-(--node-color)/40 bg-(--node-color)/10 px-2 py-0.5 magi-badge text-(--node-color)"
							style:--node-color={`var(${NODE_COLOR_VARS[node]})`}
						>
							<ChevronRight size={11} />
							Round {i + 1}
						</span>
					{/each}
				</div>
				<span class="magi-meta"
					>Per-round heading in each node panel — coloured by node identity</span
				>
			</div>
		</section>

		<!-- ── Progress indicators ── -->
		<section class="flex flex-col gap-2">
			<span class="magi-section-header text-gray-500">Progress indicators</span>
			<div class="flex flex-col gap-2">
				<div class="flex flex-col gap-0.5">
					<p class="magi-loader-text">{nodeLoadingText}…</p>
					<span class="magi-meta">Node loader — sweeping verb (neutral set)</span>
				</div>
				<div class="flex flex-col gap-0.5">
					<p class="magi-loader-text">{consensusLoadingText}…</p>
					<span class="magi-meta">Consensus loader — strategy-flavoured verb (debate)</span>
				</div>
				<div class="flex flex-col gap-0.5">
					<p class="animate-pulse text-sm text-(--magi-text-faint)">
						Waiting for MAGI — 1 / 3 responded, 1 failed…
					</p>
					<span class="magi-meta">Consensus — waiting for nodes to settle</span>
				</div>
				<div class="flex flex-col gap-1">
					<div class="flex gap-2">
						{#each MAGI_NODE_NAMES as node (node)}
							<div
								class="catalog-pulse relative h-9 flex-1 rounded-lg border magi-divider"
								style:--node-color={`var(${NODE_COLOR_VARS[node]})`}
							></div>
						{/each}
					</div>
					<span class="magi-meta">Node thinking pulse — inset glow per round</span>
				</div>
			</div>
		</section>

		<!-- ── Debate verdict status messages ── -->
		<section class="flex flex-col gap-2">
			<span class="magi-section-header text-gray-500">Debate status messages</span>
			<p class="magi-meta">
				In-stream these sit between the round ledger and the final answer, framed by horizontal
				rules (shown here per item).
			</p>
			{#each verdictMessages as v (v.caption)}
				<div class="flex flex-col gap-0.5">
					<div class="prose max-w-none prose-invert">
						<Markdown source={`${SECTION_RULE}${v.line}${SECTION_RULE}`} />
					</div>
					<span class="magi-meta">{v.caption}</span>
				</div>
			{/each}
			<div class="flex flex-col gap-0.5">
				<p class="text-sm text-(--magi-text-secondary)">{walkoverNote}</p>
				<span class="magi-meta">Walkover — only one MAGI responded (inline note, no banner)</span>
			</div>
		</section>

		<!-- ── Banners & cards ── -->
		<section class="flex flex-col gap-3">
			<span class="magi-section-header text-gray-500">Banners &amp; cards</span>

			<div class="flex flex-col gap-0.5">
				<div class="rounded-lg border magi-divider">
					<div class="flex flex-col items-center justify-center gap-2 py-5 text-center">
						<AlertTriangle size={24} class="magi-warn" />
						<p class="text-sm font-medium magi-warn">Partial consensus</p>
						<p class="magi-banner-detail">
							Only 2 of 3 models responded — consensus is based on partial data.
						</p>
					</div>
				</div>
				<span class="magi-meta">Consensus card — ran on fewer than all three MAGI</span>
			</div>

			<div class="flex flex-col gap-0.5">
				<div class="rounded-lg border magi-divider">
					<div class="flex flex-col items-center justify-center gap-2 py-5 text-center">
						<CircleAlert size={24} class="magi-error" />
						<p class="text-sm font-medium magi-error">Model unavailable</p>
						<p class="text-xs text-gray-500">The model failed to respond.</p>
					</div>
				</div>
				<span class="magi-meta">Node card — model errored with no streamed text</span>
			</div>

			<div class="flex flex-col gap-0.5">
				<p class="flex items-center gap-1.5 text-xs magi-warn">
					<AlertTriangle size={12} class="shrink-0" />
					Only 2 of 3 models responded — consensus is based on partial data.
				</p>
				<span class="magi-meta">Consensus — partial-data warning strip</span>
			</div>

			<div class="flex flex-col gap-0.5">
				<p class="text-xs magi-error">Response interrupted: the model stopped mid-stream.</p>
				<span class="magi-meta">Node — partial text arrived, then the model errored</span>
			</div>

			<div class="flex flex-col gap-0.5">
				<p class="text-xs magi-unknown">Stopped — response truncated.</p>
				<span class="magi-meta">Node / consensus — user aborted mid-stream</span>
			</div>

			<div class="flex flex-col gap-0.5">
				<p class="magi-placeholder">No consensus</p>
				<span class="magi-meta">Consensus — no answer was produced</span>
			</div>

			<div class="flex flex-col gap-0.5">
				<p class="magi-placeholder">
					Strategy: None — consensus skipped. The three responses above stand on their own.
				</p>
				<span class="magi-meta">Strategy: None — consensus phase skipped</span>
			</div>

			<div class="flex flex-col gap-0.5">
				<p class="text-sm magi-error">Error: All models failed to respond.</p>
				<span class="magi-meta">Status bar — global error</span>
			</div>
		</section>
	</div>
</div>

<style>
	/* Mirrors MagiPanel's node thinking glow — a static inset box-shadow whose
	   opacity pulses (compositor-cheap). Held still when motion is reduced. */
	.catalog-pulse::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		box-shadow: inset 0 0 20px -4px var(--node-color);
		opacity: 0;
		pointer-events: none;
		animation: catalog-pulse 2s ease-in-out infinite;
	}
	@keyframes catalog-pulse {
		0%,
		100% {
			opacity: 0;
		}
		50% {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.catalog-pulse::after {
			animation: none;
		}
	}
	:global(.reduce-motion) .catalog-pulse::after {
		animation: none;
	}
</style>
