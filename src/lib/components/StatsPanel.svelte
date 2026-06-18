<script lang="ts">
	import { X, Trash2, Download } from 'lucide-svelte';
	import {
		loadRunStats,
		clearRunStats,
		exportRunStats,
		aggregate,
		type CountEntry,
		type RunStatRecord
	} from '$lib/magi/run-stats';
	import { STRATEGY_LABELS, type StrategyName } from '$lib/magi/consensus/types';
	import ConfirmModal from './ConfirmModal.svelte';
	import { tooltip } from '$lib/actions/tooltip';
	import {
		NODE_LABELS,
		NODE_LABELS_GENERIC,
		type MagiNodeName,
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
	const nodeOrder: MagiNodeName[] = ['MAGI_1', 'MAGI_2', 'MAGI_3'];
	const strategyOrder: StrategyName[] = FILTERABLE_STRATEGIES;
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

	// A usage axis renders the same way each time: label, bar, count (share).
	function topN(entries: CountEntry[], n = 6): CountEntry[] {
		return entries.slice(0, n);
	}
</script>

<div
	class="flex max-h-[80vh] flex-col gap-3 overflow-y-auto magi-popover p-4 text-sm text-(--magi-text-secondary)"
>
	<div class="flex items-center justify-between">
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

	{#if records.length > 0}
		<!-- Strategy + date filters — chip rows sit above the breakdowns. Hidden when
		     there are no records at all (the empty-state CTA below carries the panel). -->
		<div class="flex flex-wrap items-center gap-1">
			{#each FILTER_OPTIONS as opt (opt)}
				<button
					type="button"
					class="rounded px-2 py-0.5 text-xs transition-colors {filter === opt
						? 'bg-gray-600 text-white'
						: 'bg-(--magi-surface-bg) text-(--magi-text-muted) hover:bg-(--magi-surface-hover)'}"
					onclick={() => (filter = opt)}
					aria-pressed={filter === opt}
				>
					{opt === 'all' ? 'All' : STRATEGY_LABELS[opt]}
				</button>
			{/each}
		</div>
		<div class="flex flex-wrap items-center gap-1">
			{#each DATE_OPTIONS as opt (opt.key)}
				<button
					type="button"
					class="rounded px-2 py-0.5 text-xs transition-colors {dateRange === opt.key
						? 'bg-gray-600 text-white'
						: 'bg-(--magi-surface-bg) text-(--magi-text-muted) hover:bg-(--magi-surface-hover)'}"
					onclick={() => (dateRange = opt.key)}
					aria-pressed={dateRange === opt.key}
				>
					{opt.label}
				</button>
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
				{#each strategyOrder as s (s)}
					{@const count = agg.byStrategy[s] ?? 0}
					<div class="flex items-center gap-2 text-xs">
						<span class="w-28 text-(--magi-text-secondary)">{STRATEGY_LABELS[s]}</span>
						<div class="h-1.5 flex-1 overflow-hidden rounded-sm bg-(--magi-surface-bg)">
							<div
								class="h-full bg-indigo-500/80"
								style="width: {agg.total > 0 ? ((count / agg.total) * 100).toFixed(1) : 0}%"
							></div>
						</div>
						<span class="shrink-0 text-right font-mono whitespace-nowrap text-(--magi-text-muted)">
							{count} ({pct(count, agg.total)})
						</span>
					</div>
				{/each}
			</section>
		{/if}

		<!-- Usage by gateway -->
		<section class="flex flex-col gap-1">
			<h3 class="magi-subhead">Usage by gateway</h3>
			{#each topN(agg.usageByGateway) as e (e.key)}
				<div class="flex items-center gap-2 text-xs">
					<span class="w-28 truncate text-(--magi-text-secondary)" use:tooltip={e.label}
						>{e.label}</span
					>
					<div class="h-1.5 flex-1 overflow-hidden rounded-sm bg-(--magi-surface-bg)">
						<div
							class="h-full bg-sky-500/70"
							style="width: {(e.count / agg.usageByGateway[0].count) * 100}%"
						></div>
					</div>
					<span class="shrink-0 text-right font-mono whitespace-nowrap text-(--magi-text-muted)"
						>{e.count}</span
					>
				</div>
			{/each}
		</section>

		<!-- Usage by provider -->
		<section class="flex flex-col gap-1">
			<h3 class="magi-subhead">Usage by provider</h3>
			{#each topN(agg.usageByProvider) as e (e.key)}
				<div class="flex items-center gap-2 text-xs">
					<span class="w-28 truncate text-(--magi-text-secondary)" use:tooltip={e.label}
						>{e.label}</span
					>
					<div class="h-1.5 flex-1 overflow-hidden rounded-sm bg-(--magi-surface-bg)">
						<div
							class="h-full bg-teal-500/70"
							style="width: {(e.count / agg.usageByProvider[0].count) * 100}%"
						></div>
					</div>
					<span class="shrink-0 text-right font-mono whitespace-nowrap text-(--magi-text-muted)"
						>{e.count}</span
					>
				</div>
			{/each}
		</section>

		<!-- Usage by model — capped; long tail summarized. -->
		<section class="flex flex-col gap-1">
			<h3 class="magi-subhead">Usage by model</h3>
			{#each topN(agg.usageByModel) as e (e.key)}
				<div class="flex items-center gap-2 text-xs">
					<span class="flex-1 truncate text-(--magi-text-muted)" use:tooltip={e.key}>{e.key}</span>
					<span class="shrink-0 text-right font-mono whitespace-nowrap text-(--magi-text-muted)"
						>{e.count}</span
					>
				</div>
			{/each}
			{#if agg.usageByModel.length > 6}
				<p class="magi-meta">+ {agg.usageByModel.length - 6} more</p>
			{/if}
		</section>

		<!-- Usage by node -->
		<section class="flex flex-col gap-1">
			<h3 class="magi-subhead">Usage by node</h3>
			{#each nodeOrder as node (node)}
				{@const count = agg.usageByNode[node] ?? 0}
				<div class="flex items-center justify-between text-xs">
					<span class="text-(--magi-text-secondary)">{nodeLabels[node]}</span>
					<span class="shrink-0 pl-2 font-mono whitespace-nowrap text-(--magi-text-muted)"
						>{count}</span
					>
				</div>
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
				{#each nodeOrder as node (node)}
					{@const wins = v.winsByNode[node] ?? 0}
					<div class="flex items-center gap-2 text-xs">
						<span class="w-24 text-(--magi-text-secondary)">{nodeLabels[node]}</span>
						<div class="h-1.5 flex-1 overflow-hidden rounded-sm bg-(--magi-surface-bg)">
							<div
								class="h-full bg-emerald-500/80"
								style="width: {v.total > 0 ? ((wins / v.total) * 100).toFixed(1) : 0}%"
							></div>
						</div>
						<span class="shrink-0 text-right font-mono whitespace-nowrap text-(--magi-text-muted)">
							{wins} ({pct(wins, v.total)})
						</span>
					</div>
				{/each}
			</section>

			<!-- Wins by model — separates "node bias" from "model bias". -->
			<section class="flex flex-col gap-1">
				<h3 class="magi-subhead">Wins by model</h3>
				{#each v.winsByModel.slice(0, 6) as entry (entry.model + entry.node)}
					<div class="flex items-center gap-2 text-xs">
						<span class="w-24 text-(--magi-text-secondary)">{nodeLabels[entry.node]}</span>
						<span class="flex-1 truncate text-(--magi-text-muted)" use:tooltip={entry.model}
							>{entry.model}</span
						>
						<span class="shrink-0 text-right font-mono whitespace-nowrap text-(--magi-text-muted)">
							{entry.wins} ({pct(entry.wins, v.total)})
						</span>
					</div>
				{/each}
				{#if v.winsByModel.length > 6}
					<p class="magi-meta">+ {v.winsByModel.length - 6} more</p>
				{/if}
			</section>

			<!-- Wins by gateway / provider -->
			<section class="flex flex-col gap-1">
				<h3 class="magi-subhead">Wins by gateway</h3>
				{#each v.winsByGateway as e (e.key)}
					<div class="flex items-center justify-between text-xs">
						<span class="text-(--magi-text-secondary)">{e.label}</span>
						<span class="shrink-0 pl-2 font-mono whitespace-nowrap text-(--magi-text-muted)"
							>{e.count} ({pct(e.count, v.total)})</span
						>
					</div>
				{/each}
			</section>
			<section class="flex flex-col gap-1">
				<h3 class="magi-subhead">Wins by provider</h3>
				{#each v.winsByProvider as e (e.key)}
					<div class="flex items-center justify-between text-xs">
						<span class="text-(--magi-text-secondary)">{e.label}</span>
						<span class="shrink-0 pl-2 font-mono whitespace-nowrap text-(--magi-text-muted)"
							>{e.count} ({pct(e.count, v.total)})</span
						>
					</div>
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
					<div class="flex justify-between">
						<span class="text-(--magi-text-secondary)">Decisive</span>
						<span class="shrink-0 pl-2 font-mono whitespace-nowrap text-(--magi-text-muted)">
							{v.tiebreakDistribution.none} ({pct(v.tiebreakDistribution.none, v.total)})
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-(--magi-text-secondary)">Best-score tiebreak</span>
						<span class="shrink-0 pl-2 font-mono whitespace-nowrap text-(--magi-text-muted)">
							{v.tiebreakDistribution['best-score']} ({pct(
								v.tiebreakDistribution['best-score'],
								v.total
							)})
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-(--magi-text-secondary)">Node-order tiebreak</span>
						<span class="shrink-0 pl-2 font-mono whitespace-nowrap text-(--magi-text-muted)">
							{v.tiebreakDistribution['node-order']} ({pct(
								v.tiebreakDistribution['node-order'],
								v.total
							)})
						</span>
					</div>
					{#if v.tiebreakDistribution.walkover > 0}
						<div class="flex justify-between">
							<span class="text-(--magi-text-secondary)">Walkover</span>
							<span class="shrink-0 pl-2 font-mono whitespace-nowrap text-(--magi-text-muted)">
								{v.tiebreakDistribution.walkover} ({pct(v.tiebreakDistribution.walkover, v.total)})
							</span>
						</div>
					{/if}
				</div>
			</section>

			<!-- Length correlation — sanity check for "longer answers tend to win" hypothesis. -->
			<section class="flex flex-col gap-1">
				<h3 class="magi-subhead">Avg response length (chars)</h3>
				<div class="flex justify-between text-xs">
					<span class="text-(--magi-text-secondary)">Winners</span>
					<span class="shrink-0 pl-2 font-mono whitespace-nowrap text-(--magi-text-muted)"
						>{Math.round(v.winnerAvgLength)}</span
					>
				</div>
				<div class="flex justify-between text-xs">
					<span class="text-(--magi-text-secondary)">Losers</span>
					<span class="shrink-0 pl-2 font-mono whitespace-nowrap text-(--magi-text-muted)"
						>{Math.round(v.loserAvgLength)}</span
					>
				</div>
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
					<div class="flex items-center gap-2 text-xs">
						<span class="w-24 text-(--magi-text-secondary)">{VERDICT_LABELS[verdict]}</span>
						<div class="h-1.5 flex-1 overflow-hidden rounded-sm bg-(--magi-surface-bg)">
							<div
								class="h-full bg-purple-500/70"
								style="width: {dbt.total > 0 ? ((count / dbt.total) * 100).toFixed(1) : 0}%"
							></div>
						</div>
						<span class="shrink-0 text-right font-mono whitespace-nowrap text-(--magi-text-muted)">
							{count} ({pct(count, dbt.total)})
						</span>
					</div>
				{/each}
			</section>

			<!-- Convergence speed + stalemate rate, when there's anything to report. -->
			{#if dbt.verdictCounts.consensus > 0 || dbt.hitLimitCount > 0}
				<section class="flex flex-col gap-1">
					<h3 class="magi-subhead">Convergence</h3>
					{#if dbt.verdictCounts.consensus > 0}
						<div class="flex justify-between text-xs">
							<span class="text-(--magi-text-secondary)">Avg rounds to converge</span>
							<span class="shrink-0 pl-2 font-mono whitespace-nowrap text-(--magi-text-muted)">
								{dbt.avgRoundsToConverge.toFixed(2)}
							</span>
						</div>
					{/if}
					{#if dbt.hitLimitCount > 0}
						<div class="flex justify-between text-xs">
							<span class="text-(--magi-text-secondary)">Hit round limit</span>
							<span class="shrink-0 pl-2 font-mono whitespace-nowrap text-(--magi-text-muted)">
								{dbt.hitLimitCount} ({pct(dbt.hitLimitCount, dbt.total)})
							</span>
						</div>
					{/if}
				</section>
			{/if}

			<!-- Revision rate by node — which nodes are most willing to revise their answer. -->
			<section class="flex flex-col gap-1">
				<h3 class="magi-subhead">Revision rate by node</h3>
				{#each nodeOrder as node (node)}
					{@const r = dbt.revisionRateByNode[node]}
					<div class="flex items-center gap-2 text-xs">
						<span class="w-24 text-(--magi-text-secondary)">{nodeLabels[node]}</span>
						<div class="h-1.5 flex-1 overflow-hidden rounded-sm bg-(--magi-surface-bg)">
							<div class="h-full bg-amber-500/70" style="width: {(r.rate * 100).toFixed(1)}%"></div>
						</div>
						<span class="shrink-0 text-right font-mono whitespace-nowrap text-(--magi-text-muted)">
							{r.revised}/{r.rounds} ({r.rounds > 0 ? `${(r.rate * 100).toFixed(0)}%` : '—'})
						</span>
					</div>
				{/each}
			</section>

			<!-- Dissenter — when a clean 2-vs-1 split happened, who was the holdout? -->
			{#if nodeOrder.some((n) => dbt.dissenterByNode[n] > 0)}
				<section class="flex flex-col gap-1">
					<h3 class="magi-subhead">
						Dissenter
						<span class="font-normal text-(--magi-text-faint)"
							>({nodeOrder.reduce((s, n) => s + dbt.dissenterByNode[n], 0)} 2-vs-1 splits)</span
						>
					</h3>
					{#each nodeOrder as node (node)}
						{@const count = dbt.dissenterByNode[node] ?? 0}
						{@const denom = nodeOrder.reduce((s, n) => s + dbt.dissenterByNode[n], 0)}
						<div class="flex items-center gap-2 text-xs">
							<span class="w-24 text-(--magi-text-secondary)">{nodeLabels[node]}</span>
							<div class="h-1.5 flex-1 overflow-hidden rounded-sm bg-(--magi-surface-bg)">
								<div
									class="h-full bg-rose-500/70"
									style="width: {denom > 0 ? ((count / denom) * 100).toFixed(1) : 0}%"
								></div>
							</div>
							<span
								class="shrink-0 text-right font-mono whitespace-nowrap text-(--magi-text-muted)"
							>
								{count} ({pct(count, denom)})
							</span>
						</div>
					{/each}
				</section>
			{/if}
		{/if}
	{/if}
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
