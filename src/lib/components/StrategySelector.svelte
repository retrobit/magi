<script lang="ts">
	import type { StrategyName } from '$lib/magi/consensus';

	interface Props {
		value: StrategyName;
		onchange: (strategy: StrategyName) => void;
		disabled?: boolean;
	}

	let { value, onchange, disabled = false }: Props = $props();

	const strategies: { name: StrategyName; label: string }[] = [
		{ name: 'synthesis', label: 'Synthesis' }
	];
</script>

<div class="flex gap-1 rounded-lg bg-gray-800 p-1">
	{#each strategies as strategy}
		<button
			class="rounded-md px-4 py-2 text-sm font-medium transition-colors {value === strategy.name
				? 'bg-emerald-600 text-white'
				: 'text-gray-400 hover:text-white'}"
			{disabled}
			onclick={() => onchange(strategy.name)}
		>
			{strategy.label}
		</button>
	{/each}
</div>
