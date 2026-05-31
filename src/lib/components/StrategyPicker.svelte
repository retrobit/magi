<script lang="ts">
	import {
		STRATEGY_NAMES,
		STRATEGY_LABELS,
		STRATEGY_DESCRIPTIONS,
		STRATEGY_INTENSITY,
		FLAGSHIP_STRATEGY,
		type StrategyName
	} from '$lib/magi/consensus';
	import { CONSENSUS_GRADIENT } from '$lib/magi/types';
	import { tooltip } from '$lib/actions/tooltip';
	import { ChevronDown, Check } from 'lucide-svelte';

	interface Props {
		strategy: StrategyName;
		disabled?: boolean;
		onchange: (strategy: StrategyName) => void;
	}

	let { strategy, disabled = false, onchange }: Props = $props();

	let open = $state(false);

	// Gradient-clipped text for the flagship marker — the three-MAGI triad,
	// reusing the consensus gradient rather than introducing a new accent hue.
	const gradientText = `${CONSENSUS_GRADIENT}; -webkit-background-clip: text; background-clip: text; color: transparent;`;

	function select(s: StrategyName) {
		onchange(s);
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

<div class="relative inline-block">
	<button
		type="button"
		class="magi-select flex items-center gap-1 rounded bg-gray-800 py-0.5 pr-1.5 pl-2 text-xs text-gray-300 focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		onclick={() => (open = !open)}
		{disabled}
		aria-haspopup="listbox"
		aria-expanded={open}
		use:tooltip={STRATEGY_DESCRIPTIONS[strategy]}
	>
		{#if strategy === FLAGSHIP_STRATEGY}
			<!-- Once chosen, the flagship wears the three-MAGI gradient in the trigger.
			     Star + label live in one clipped span so the gradient sweeps continuously
			     across both rather than restarting per element. -->
			<span class="font-semibold" style={gradientText}>
				<span aria-hidden="true">✦</span>
				{STRATEGY_LABELS[strategy]}
			</span>
		{:else}
			<span>{STRATEGY_LABELS[strategy]}</span>
		{/if}
		<ChevronDown size={12} class="text-gray-500" />
	</button>

	{#if open}
		<!-- Transparent backdrop catches outside clicks (same pattern as the stats panel). -->
		<button
			class="fixed inset-0 z-40 cursor-default"
			onclick={() => (open = false)}
			aria-label="Close strategy picker"
		></button>
		<div
			class="absolute left-0 z-50 mt-1 flex w-72 flex-col gap-0.5 rounded-lg border border-gray-700 bg-gray-900 p-1 shadow-xl"
			role="listbox"
			aria-label="Consensus strategy"
		>
			{#each STRATEGY_NAMES as s (s)}
				{@const flagship = s === FLAGSHIP_STRATEGY}
				{@const selected = s === strategy}
				<button
					type="button"
					role="option"
					aria-selected={selected}
					class="relative flex w-full items-start gap-2 rounded py-1.5 pr-2 text-left transition-colors hover:bg-gray-800 {selected
						? 'bg-gray-800'
						: ''} {flagship ? 'pl-3.5' : 'pl-2'}"
					onclick={() => select(s)}
				>
					{#if flagship}
						<!-- RGB-triad strip marks the flagship without a new accent colour. -->
						<span
							class="absolute top-1.5 bottom-1.5 left-1 w-[3px] rounded-full"
							style={CONSENSUS_GRADIENT}
							aria-hidden="true"
						></span>
					{/if}
					<div class="min-w-0 flex-1">
						<div class="flex items-center justify-between gap-2">
							<span class="flex items-center gap-1 text-xs font-semibold text-gray-200">
								{STRATEGY_LABELS[s]}
								{#if flagship}
									<span class="magi-badge" style={gradientText}>✦ Flagship</span>
								{/if}
							</span>
							<!-- Relative cost / thoroughness meter. -->
							<span
								class="flex shrink-0 items-center gap-0.5"
								title="{STRATEGY_INTENSITY[s]} of 3 — relative cost"
							>
								{#each [1, 2, 3] as dot (dot)}
									<span
										class="h-1.5 w-1.5 rounded-full {dot <= STRATEGY_INTENSITY[s]
											? 'bg-gray-300'
											: 'bg-gray-700'}"
									></span>
								{/each}
							</span>
						</div>
						<p class="mt-0.5 magi-meta leading-snug">
							{STRATEGY_DESCRIPTIONS[s]}
						</p>
					</div>
					{#if selected}
						<Check size={13} class="mt-0.5 shrink-0 magi-success" />
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
