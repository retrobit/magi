<script lang="ts">
	import { STRATEGY_NAMES, type StrategyName } from '$lib/magi/consensus';

	interface Props {
		value: StrategyName;
		onchange: (strategy: StrategyName) => void;
		disabled?: boolean;
	}

	let { value, onchange, disabled = false }: Props = $props();

	const strategyLabels: Record<StrategyName, string> = {
		synthesis: 'Synthesis'
	};
</script>

<div class="flex gap-1 rounded-lg bg-gray-800 p-1">
	{#each STRATEGY_NAMES as strategy (strategy)}
		<button
			class="rounded-md px-4 py-2 text-sm font-medium transition-colors {value === strategy
				? 'bg-gray-600 text-white'
				: 'text-gray-400 hover:text-white'}"
			{disabled}
			onclick={() => onchange(strategy)}
		>
			{strategyLabels[strategy]}
		</button>
	{/each}
</div>
