<script lang="ts">
	import { X, Trash2, Download } from 'lucide-svelte';
	import {
		loadRunStats,
		clearRunStats,
		exportRunStats,
		aggregate,
		type RunStatRecord
	} from '$lib/magi/run-stats';
	import { STRATEGY_LABELS, type StrategyName } from '$lib/magi/consensus/types';
	import ConfirmModal from './ConfirmModal.svelte';
	import { tooltip } from '$lib/actions/tooltip';
	import {
		NODE_LABELS,
		NODE_LABELS_GENERIC,
		MAGI_NODE_NAMES,
		type DebateVerdict
	} from '$lib/magi/types';

	interface Props {
		/** Bumped by the parent every time a new run-stats event arrives. */
		nonce?: number;
		/** Mirror the rest of the UI: generic MAGI 1/2/3 vs. the revealed code names. */
		genericLabels?: boolean;
		onclose: () => void;
	}

	let { nonce = 0, genericLabels = true, onclose }: Props = $props();

	const nodeLabels = $derived(genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS);

	// Re-read storage whenever the parent signals a new record (or on mount).
	let records = $state<RunStatRecord[]>([]);
	$effect(() => {
		// touch nonce to register dependency
		void nonce;
		records = loadRunStats();
	});

	// Strategy filter — `'all'` is the default; selecting a specific strategy
	// re-aggregates over only that strategy's records, so every breakdown
	// (usage, voting deep-dive, debate deep-dive) recomputes automatically.
	// `none` is omitted from the filter — it never produces a run-stats event.
	type StrategyFilter = StrategyName | 'all';
	const FILTERABLE_STRATEGIES: StrategyName[] = ['synthesis', 'voting', 'debate'];
	const FILTER_OPTIONS: StrategyFilter[] = ['all', ...FILTERABLE_STRATEGIES];
	let filter = $state<StrategyFilter>('all');

	// Date-range filter — rolling windows back from now (not calendar days, to
	// dodge timezone-boundary fiddliness). Composes with the strategy filter.
	type DateRange = 'all' | '24h' | '7d' | '30d';
	const DATE_OPTIONS: { key: DateRange; label: string }[] = [
		{ key: 'all', label: 'All time' },
		{ key: '24h', label: '24h' },
		{ key: '7d', label: '7d' },
		{ key: '30d', label: '30d' }
	];
	const DAY_MS = 86_400_000;
	const DATE_WINDOW_MS: Record<Exclude<DateRange, 'all'>, number> = {
		'24h': DAY_MS,
		'7d': 7 * DAY_MS,
		'30d': 30 * DAY_MS
	};
	let dateRange = $state<DateRange>('all');

	const filteredRecords = $derived.by(() => {
		// Date.now() isn't reactive, but the cutoff only needs to be fresh when the
		// user changes a filter or a new record lands — exactly when this recomputes.
		const cutoff = dateRange === 'all' ? 0 : Date.now() - DATE_WINDOW_MS[dateRange];
		return records.filter(
			(r) => (filter === 'all' || r.stats.strategy === filter) && r.ts >= cutoff
		);
	});

	const agg = $derived(aggregate(filteredRecords));
	const verdictOrder: DebateVerdict[] = ['consensus', 'split', 'walkover'];
	const VERDICT_LABELS: Record<DebateVerdict, string> = {
		consensus: 'Consensus',
		split: 'Split',
		walkover: 'Walkover'
	};

	function pct(n: number, total: number): string {
		if (total === 0) return '—';
		return `${((n / total) * 100).toFixed(0)}%`;
	}

	// Clearing is destructive and irreversible, so it routes through a confirm
	// dialog rather than firing on the first click.
	let confirmingClear = $state(false);
	function reset() {
		confirmingClear = false;
		clearRunStats();
		records = [];
	}

	// Download the full stored envelope as a date-stamped JSON file. Always
	// exports every record regardless of the active strategy filter — a partial
	// export would be lossy at re-import. Users wanting a filtered slice can
	// apply the filter externally.
	function exportJson() {
		const blob = new Blob([exportRunStats()], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		// Local-date `YYYY-MM-DD` — readable in the filename without timezone math.
		const stamp = new Date().toISOString().slice(0, 10);
		const a = document.createElement('a');
		a.href = url;
		a.download = `magi-stats-${stamp}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	// Usage axes list their top entries only; the long tail collapses to "+ N more".
	const TOP_N = 6;
</script>

<!-- One selectable filter chip. -->
{#snippet chip(label: string, active: boolean, pick: () => void)}
	<button
		type="button"
		class="rounded px-2 py-0.5 text-xs transition-colors {active
			? 'bg-(--magi-btn-bg) text-white'
			: 'bg-(--magi-surface-bg) text-(--magi-text-muted) hover:bg-(--magi-surface-hover)'}"
		onclick={pick}
		aria-pressed={active}
	>
		{label}
	</button>
{/snippet}

<!-- label, proportional bar (`fraction` 0..1, `fill` a literal Tailwind class), right-aligned
     figure. `labelClass` carries the label width; `tip` adds a tooltip for truncated labels. -->
{#snippet bar(
	label: string,
	labelClass: string,
	fraction: number,
	fill: string,
	text: string,
	tip?: string
)}
	<div class="flex items-center gap-2 text-xs">
		<span class="{labelClass} text-(--magi-text-secondary)" use:tooltip={tip}>{label}</span>
		<div class="h-1.5 flex-1 overflow-hidden rounded-sm bg-(--magi-surface-bg)">
			<div class="h-full {fill}" style="width: {(fraction * 100).toFixed(1)}%"></div>
		</div>
		<span class="shrink-0 text-right font-mono whitespace-nowrap text-(--magi-text-muted)">
			{text}
		</span>
	</div>
{/snippet}

<!-- label on the left, value on the right. -->
{#snippet kvRow(label: string, value: string | number)}
	<div class="flex items-center justify-between text-xs">
		<span class="text-(--magi-text-secondary)">{label}</span>
		<span class="shrink-0 pl-2 font-mono whitespace-nowrap text-(--magi-text-muted)">{value}</span>
	</div>
{/snippet}

<div
	class="flex min-h-0 flex-col overflow-hidden magi-popover text-sm text-(--magi-text-secondary)"
>
	<div class="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
		<span class="flex items-center gap-1.5 magi-section-header text-(--magi-text-muted)">
			📊 STATS
			<span class="font-normal text-(--magi-text-faint)">({agg.total} runs)</span>
		</span>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="text-(--magi-text-faint) transition-colors hover:text-green-400 disabled:opacity-50"
				onclick={exportJson}
				disabled={records.length === 0}
				aria-label="Export stats as JSON"
				use:tooltip={'Download all stats as JSON'}
			>
				<Download size={14} />
			</button>
			<button
				type="button"
				class="text-(--magi-text-faint) transition-colors hover:text-red-400 disabled:opacity-50"
				onclick={() => (confirmingClear = true)}
				disabled={agg.total === 0}
				aria-label="Clear stats"
				use:tooltip={'Clear all recorded stats'}
			>
				<Trash2 size={14} />
			</button>
			<button
				type="button"
				class="text-(--magi-text-faint) transition-colors hover:text-(--magi-text)"
				onclick={onclose}
				aria-label="Close stats panel"
			>
				<X size={14} />
			</button>
		</div>
	</div>

	<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
		{#if records.length > 0}
			<!-- Strategy + date filters — chip rows sit above the breakdowns. Hidden when
		     there are no records at all (the empty-state CTA below carries the panel). -->
			<div class="flex flex-wrap items-center gap-1">
				{#each FILTER_OPTIONS as opt (opt)}
					{@render chip(
						opt === 'all' ? 'All' : STRATEGY_LABELS[opt],
						filter === opt,
						() => (filter = opt)
					)}
				{/each}
			</div>
			<div class="flex flex-wrap items-center gap-1">
				{#each DATE_OPTIONS as opt (opt.key)}
					{@render chip(opt.label, dateRange === opt.key, () => (dateRange = opt.key))}
				{/each}
			</div>
		{/if}

		{#if records.length === 0}
			<p class="magi-meta">Run a query — stats accumulate here as each consensus completes.</p>
		{:else if agg.total === 0}
			<!-- Filter excludes everything — distinct from the never-ran-a-query
		     empty state so the user knows it's their filter, not missing data. -->
			<p class="magi-meta">
				No {filter === 'all' ? '' : STRATEGY_LABELS[filter as StrategyName] + ' '}runs{dateRange ===
				'all'
					? ' recorded yet'
					: ` in the last ${DATE_OPTIONS.find((o) => o.key === dateRange)?.label}`}.
			</p>
		{:else}
			<!-- ===== Usage (every run, both strategies) =====
		     Hidden when a specific strategy is selected — the breakdown is always
		     100% on that strategy, so the row carries no information. -->
			{#if filter === 'all'}
				<section class="flex flex-col gap-1">
					<h3 class="magi-subhead">Runs by strategy</h3>
					{#each FILTERABLE_STRATEGIES as s (s)}
						{@const count = agg.byStrategy[s] ?? 0}
						{@render bar(
							STRATEGY_LABELS[s],
							'w-28',
							count / agg.total,
							'bg-indigo-500/80',
							`${count} (${pct(count, agg.total)})`
						)}
					{/each}
				</section>
			{/if}

			<!-- Usage by gateway -->
			<section class="flex flex-col gap-1">
				<h3 class="magi-subhead">Usage by gateway</h3>
				{#each agg.usageByGateway.slice(0, TOP_N) as e (e.key)}
					{@render bar(
						e.label,
						'w-28 truncate',
						e.count / agg.usageByGateway[0].count,
						'bg-sky-500/70',
						`${e.count}`,
						e.label
					)}
				{/each}
			</section>

			<!-- Usage by provider -->
			<section class="flex flex-col gap-1">
				<h3 class="magi-subhead">Usage by provider</h3>
				{#each agg.usageByProvider.slice(0, TOP_N) as e (e.key)}
					{@render bar(
						e.label,
						'w-28 truncate',
						e.count / agg.usageByProvider[0].count,
						'bg-teal-500/70',
						`${e.count}`,
						e.label
					)}
				{/each}
			</section>

			<!-- Usage by model — capped; long tail summarized. -->
			<section class="flex flex-col gap-1">
				<h3 class="magi-subhead">Usage by model</h3>
				{#each agg.usageByModel.slice(0, TOP_N) as e (e.key)}
					<div class="flex items-center gap-2 text-xs">
						<span class="flex-1 truncate text-(--magi-text-muted)" use:tooltip={e.key}>{e.key}</span
						>
						<span class="shrink-0 text-right font-mono whitespace-nowrap text-(--magi-text-muted)"
							>{e.count}</span
						>
					</div>
				{/each}
				{#if agg.usageByModel.length > TOP_N}
					<p class="magi-meta">+ {agg.usageByModel.length - TOP_N} more</p>
				{/if}
			</section>

			<!-- Usage by node -->
			<section class="flex flex-col gap-1">
				<h3 class="magi-subhead">Usage by node</h3>
				{#each MAGI_NODE_NAMES as node (node)}
					{@render kvRow(nodeLabels[node], agg.usageByNode[node] ?? 0)}
				{/each}
			</section>

			<!-- ===== Structured Voting deep-dive (only when votes exist) ===== -->
			{#if agg.voting.total > 0}
				{@const v = agg.voting}
				<div class="mt-1 border-t border-(--magi-border) pt-2">
					<span class="magi-section-header text-(--magi-text-muted)">
						🗳️ Structured Voting
						<span class="font-normal text-(--magi-text-faint)">({v.total} votes)</span>
					</span>
				</div>

				<!-- Wins by node -->
				<section class="flex flex-col gap-1">
					<h3 class="magi-subhead">Wins by node</h3>
					{#each MAGI_NODE_NAMES as node (node)}
						{@const wins = v.winsByNode[node] ?? 0}
						{@render bar(
							nodeLabels[node],
							'w-24',
							wins / v.total,
							'bg-emerald-500/80',
							`${wins} (${pct(wins, v.total)})`
						)}
					{/each}
				</section>

				<!-- Wins by model — separates "node bias" from "model bias". -->
				<section class="flex flex-col gap-1">
					<h3 class="magi-subhead">Wins by model</h3>
					{#each v.winsByModel.slice(0, TOP_N) as entry (entry.model + entry.node)}
						<div class="flex items-center gap-2 text-xs">
							<span class="w-24 text-(--magi-text-secondary)">{nodeLabels[entry.node]}</span>
							<span class="flex-1 truncate text-(--magi-text-muted)" use:tooltip={entry.model}
								>{entry.model}</span
							>
							<span
								class="shrink-0 text-right font-mono whitespace-nowrap text-(--magi-text-muted)"
							>
								{entry.wins} ({pct(entry.wins, v.total)})
							</span>
						</div>
					{/each}
					{#if v.winsByModel.length > TOP_N}
						<p class="magi-meta">+ {v.winsByModel.length - TOP_N} more</p>
					{/if}
				</section>

				<!-- Wins by gateway / provider -->
				<section class="flex flex-col gap-1">
					<h3 class="magi-subhead">Wins by gateway</h3>
					{#each v.winsByGateway as e (e.key)}
						{@render kvRow(e.label, `${e.count} (${pct(e.count, v.total)})`)}
					{/each}
				</section>
				<section class="flex flex-col gap-1">
					<h3 class="magi-subhead">Wins by provider</h3>
					{#each v.winsByProvider as e (e.key)}
						{@render kvRow(e.label, `${e.count} (${pct(e.count, v.total)})`)}
					{/each}
				</section>

				<!-- Position bias — Candidate A vs B average score across every juror response. -->
				<section class="flex flex-col gap-1">
					<h3 class="magi-subhead">
						Position bias <span class="font-normal text-(--magi-text-faint)"
							>({v.avgPositionBias.samples} juror scores)</span
						>
					</h3>
					<div class="flex items-center gap-2 text-xs">
						<span class="w-20 text-(--magi-text-secondary)">Candidate A</span>
						<span class="flex-1 font-mono text-(--magi-text-muted)"
							>avg {v.avgPositionBias.avgA.toFixed(2)}</span
						>
					</div>
					<div class="flex items-center gap-2 text-xs">
						<span class="w-20 text-(--magi-text-secondary)">Candidate B</span>
						<span class="flex-1 font-mono text-(--magi-text-muted)"
							>avg {v.avgPositionBias.avgB.toFixed(2)}</span
						>
					</div>
					<p class="magi-meta">
						A &gt; B suggests jurors favor the first candidate shown. Seat order is randomized per
						turn, so a persistent gap points to a real first-position bias rather than any one node.
					</p>
				</section>

				<!-- Tiebreak distribution — how often does the winner actually beat the runner-up cleanly? -->
				<section class="flex flex-col gap-1">
					<h3 class="magi-subhead">Tiebreak path</h3>
					<div class="flex flex-col gap-0.5 text-xs">
						{@render kvRow(
							'Decisive',
							`${v.tiebreakDistribution.none} (${pct(v.tiebreakDistribution.none, v.total)})`
						)}
						{@render kvRow(
							'Best-score tiebreak',
							`${v.tiebreakDistribution['best-score']} (${pct(v.tiebreakDistribution['best-score'], v.total)})`
						)}
						{@render kvRow(
							'Node-order tiebreak',
							`${v.tiebreakDistribution['node-order']} (${pct(v.tiebreakDistribution['node-order'], v.total)})`
						)}
						{#if v.tiebreakDistribution.walkover > 0}
							{@render kvRow(
								'Walkover',
								`${v.tiebreakDistribution.walkover} (${pct(v.tiebreakDistribution.walkover, v.total)})`
							)}
						{/if}
					</div>
				</section>

				<!-- Length correlation — sanity check for "longer answers tend to win" hypothesis. -->
				<section class="flex flex-col gap-1">
					<h3 class="magi-subhead">Avg response length (chars)</h3>
					{@render kvRow('Winners', Math.round(v.winnerAvgLength))}
					{@render kvRow('Losers', Math.round(v.loserAvgLength))}
				</section>
			{/if}

			<!-- ===== Multi-Round Debate deep-dive (only when debates have run) ===== -->
			{#if agg.debate.total > 0}
				{@const dbt = agg.debate}
				<div class="mt-1 border-t border-(--magi-border) pt-2">
					<span class="magi-section-header text-(--magi-text-muted)">
						🗣️ Multi-Round Debate
						<span class="font-normal text-(--magi-text-faint)">({dbt.total} runs)</span>
					</span>
				</div>

				<!-- Verdict distribution — how often does debate actually converge? -->
				<section class="flex flex-col gap-1">
					<h3 class="magi-subhead">Verdict distribution</h3>
					{#each verdictOrder as verdict (verdict)}
						{@const count = dbt.verdictCounts[verdict] ?? 0}
						{@render bar(
							VERDICT_LABELS[verdict],
							'w-24',
							count / dbt.total,
							'bg-purple-500/70',
							`${count} (${pct(count, dbt.total)})`
						)}
					{/each}
				</section>

				<!-- Convergence speed + stalemate rate, when there's anything to report. -->
				{#if dbt.verdictCounts.consensus > 0 || dbt.hitLimitCount > 0}
					<section class="flex flex-col gap-1">
						<h3 class="magi-subhead">Convergence</h3>
						{#if dbt.verdictCounts.consensus > 0}
							{@render kvRow('Avg rounds to converge', dbt.avgRoundsToConverge.toFixed(2))}
						{/if}
						{#if dbt.hitLimitCount > 0}
							{@render kvRow(
								'Hit round limit',
								`${dbt.hitLimitCount} (${pct(dbt.hitLimitCount, dbt.total)})`
							)}
						{/if}
					</section>
				{/if}

				<!-- Revision rate by node — which nodes are most willing to revise their answer. -->
				<section class="flex flex-col gap-1">
					<h3 class="magi-subhead">Revision rate by node</h3>
					{#each MAGI_NODE_NAMES as node (node)}
						{@const r = dbt.revisionRateByNode[node]}
						{@render bar(
							nodeLabels[node],
							'w-24',
							r.rate,
							'bg-(--magi-color-warn)/70',
							`${r.revised}/${r.rounds} (${r.rounds > 0 ? `${(r.rate * 100).toFixed(0)}%` : '—'})`
						)}
					{/each}
				</section>

				<!-- Dissenter — when a clean 2-vs-1 split happened, who was the holdout? -->
				{#if MAGI_NODE_NAMES.some((n) => dbt.dissenterByNode[n] > 0)}
					<section class="flex flex-col gap-1">
						<h3 class="magi-subhead">
							Dissenter
							<span class="font-normal text-(--magi-text-faint)"
								>({MAGI_NODE_NAMES.reduce((s, n) => s + dbt.dissenterByNode[n], 0)} 2-vs-1 splits)</span
							>
						</h3>
						{#each MAGI_NODE_NAMES as node (node)}
							{@const count = dbt.dissenterByNode[node] ?? 0}
							{@const denom = MAGI_NODE_NAMES.reduce((s, n) => s + dbt.dissenterByNode[n], 0)}
							{@render bar(
								nodeLabels[node],
								'w-24',
								count / denom,
								'bg-rose-500/70',
								`${count} (${pct(count, denom)})`
							)}
						{/each}
					</section>
				{/if}
			{/if}
		{/if}
	</div>
</div>

{#if confirmingClear}
	<ConfirmModal
		title="Clear all stats?"
		message="This permanently deletes every recorded run stat from this browser. It can't be undone."
		confirmLabel="Clear stats"
		onconfirm={reset}
		oncancel={() => (confirmingClear = false)}
	/>
{/if}

<style>
	/* Indent each section's rows under their heading so the breakdowns read as a
	   nested list rather than a flat column. */
	section > :global(:not(h3)) {
		padding-left: 0.75rem;
	}
</style>
