<script lang="ts">
	import { X, Trash2 } from 'lucide-svelte';
	import {
		loadVotingStats,
		clearVotingStats,
		aggregate,
		type VotingStatRecord
	} from '$lib/magi/voting-stats';
	import { NODE_LABELS, NODE_LABELS_GENERIC, type MagiNodeName } from '$lib/magi/types';

	interface Props {
		/** Bumped by the parent every time a new vote-stats event arrives. */
		nonce?: number;
		/** Mirror the rest of the UI: MAGI 1/2/3 vs MELCHIOR/BALTHASAR/CASPAR. */
		genericLabels?: boolean;
		onclose: () => void;
	}

	let { nonce = 0, genericLabels = true, onclose }: Props = $props();

	const nodeLabels = $derived(genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS);

	// Re-read storage whenever the parent signals a new record (or on mount).
	let records = $state<VotingStatRecord[]>([]);
	$effect(() => {
		// touch nonce to register dependency
		void nonce;
		records = loadVotingStats();
	});

	const agg = $derived(aggregate(records));
	const nodeOrder: MagiNodeName[] = ['MELCHIOR', 'BALTHASAR', 'CASPAR'];

	function pct(n: number, total: number): string {
		if (total === 0) return '—';
		return `${((n / total) * 100).toFixed(0)}%`;
	}

	function reset() {
		clearVotingStats();
		records = [];
	}
</script>

<div
	class="flex flex-col gap-3 rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-200 shadow-xl"
>
	<div class="flex items-center justify-between">
		<span class="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-gray-400">
			📊 VOTING STATS
			<span class="font-normal text-gray-500">({agg.total} votes)</span>
		</span>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="text-gray-500 transition-colors hover:text-red-400 disabled:opacity-40"
				onclick={reset}
				disabled={agg.total === 0}
				aria-label="Clear stats"
				title="Clear all recorded stats"
			>
				<Trash2 size={14} />
			</button>
			<button
				type="button"
				class="text-gray-500 transition-colors hover:text-white"
				onclick={onclose}
				aria-label="Close stats panel"
			>
				<X size={14} />
			</button>
		</div>
	</div>

	{#if agg.total === 0}
		<p class="text-xs text-gray-500">
			Run a query under <strong>Structured Voting</strong> — stats accumulate here as votes complete.
		</p>
	{:else}
		<!-- Wins by node -->
		<section class="flex flex-col gap-1">
			<h3 class="text-xs font-semibold text-gray-400">Wins by node</h3>
			{#each nodeOrder as node (node)}
				{@const wins = agg.winsByNode[node] ?? 0}
				<div class="flex items-center gap-2 text-xs">
					<span class="w-24 text-gray-300">{nodeLabels[node]}</span>
					<div class="h-1.5 flex-1 overflow-hidden rounded-sm bg-gray-800">
						<div
							class="h-full bg-emerald-500/80"
							style="width: {agg.total > 0 ? ((wins / agg.total) * 100).toFixed(1) : 0}%"
						></div>
					</div>
					<span class="w-14 text-right font-mono text-gray-400">
						{wins} ({pct(wins, agg.total)})
					</span>
				</div>
			{/each}
		</section>

		<!-- Wins by model — separates "node bias" from "model bias", critical for the free tier. -->
		<section class="flex flex-col gap-1">
			<h3 class="text-xs font-semibold text-gray-400">Wins by model</h3>
			{#each agg.winsByModel.slice(0, 6) as entry (entry.model + entry.node)}
				<div class="flex items-center gap-2 text-xs">
					<span class="w-24 text-gray-300">{nodeLabels[entry.node]}</span>
					<span class="flex-1 truncate text-gray-400" title={entry.model}>{entry.model}</span>
					<span class="w-14 text-right font-mono text-gray-400">
						{entry.wins} ({pct(entry.wins, agg.total)})
					</span>
				</div>
			{/each}
			{#if agg.winsByModel.length > 6}
				<p class="text-[11px] text-gray-500">+ {agg.winsByModel.length - 6} more</p>
			{/if}
		</section>

		<!-- Position bias — Candidate A vs B average score across every juror response. -->
		<section class="flex flex-col gap-1">
			<h3 class="text-xs font-semibold text-gray-400">
				Position bias <span class="font-normal text-gray-500"
					>({agg.avgPositionBias.samples} juror scores)</span
				>
			</h3>
			<div class="flex items-center gap-2 text-xs">
				<span class="w-20 text-gray-300">Candidate A</span>
				<span class="flex-1 font-mono text-gray-400">avg {agg.avgPositionBias.avgA.toFixed(2)}</span
				>
			</div>
			<div class="flex items-center gap-2 text-xs">
				<span class="w-20 text-gray-300">Candidate B</span>
				<span class="flex-1 font-mono text-gray-400">avg {agg.avgPositionBias.avgB.toFixed(2)}</span
				>
			</div>
			<p class="text-[11px] text-gray-500">
				A &gt; B suggests jurors favor the first candidate shown — {nodeLabels.MELCHIOR} sits in slot
				A whenever both other nodes vote.
			</p>
		</section>

		<!-- Tiebreak distribution — how often does the winner actually beat the runner-up cleanly? -->
		<section class="flex flex-col gap-1">
			<h3 class="text-xs font-semibold text-gray-400">Tiebreak path</h3>
			<div class="flex flex-col gap-0.5 text-xs">
				<div class="flex justify-between">
					<span class="text-gray-300">Decisive</span>
					<span class="font-mono text-gray-400">
						{agg.tiebreakDistribution.none} ({pct(agg.tiebreakDistribution.none, agg.total)})
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-300">Best-score tiebreak</span>
					<span class="font-mono text-gray-400">
						{agg.tiebreakDistribution['best-score']} ({pct(
							agg.tiebreakDistribution['best-score'],
							agg.total
						)})
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-300">Node-order tiebreak</span>
					<span class="font-mono text-gray-400">
						{agg.tiebreakDistribution['node-order']} ({pct(
							agg.tiebreakDistribution['node-order'],
							agg.total
						)})
					</span>
				</div>
				{#if agg.tiebreakDistribution.walkover > 0}
					<div class="flex justify-between">
						<span class="text-gray-300">Walkover</span>
						<span class="font-mono text-gray-400">
							{agg.tiebreakDistribution.walkover} ({pct(
								agg.tiebreakDistribution.walkover,
								agg.total
							)})
						</span>
					</div>
				{/if}
			</div>
		</section>

		<!-- Length correlation — sanity check for "longer answers tend to win" hypothesis. -->
		<section class="flex flex-col gap-1">
			<h3 class="text-xs font-semibold text-gray-400">Avg response length (chars)</h3>
			<div class="flex justify-between text-xs">
				<span class="text-gray-300">Winners</span>
				<span class="font-mono text-gray-400">{Math.round(agg.winnerAvgLength)}</span>
			</div>
			<div class="flex justify-between text-xs">
				<span class="text-gray-300">Losers</span>
				<span class="font-mono text-gray-400">{Math.round(agg.loserAvgLength)}</span>
			</div>
		</section>
	{/if}
</div>
