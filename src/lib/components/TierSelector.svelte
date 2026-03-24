<script lang="ts">
	import { TIER_NAMES, type TierName } from '$lib/magi/types';

	interface Props {
		value: TierName;
		onchange: (tier: TierName) => void;
		disabled?: boolean;
	}

	let { value, onchange, disabled = false }: Props = $props();

	const tierLabels: Record<TierName, string> = {
		frontier: 'Frontier',
		balanced: 'Balanced',
		budget: 'Budget',
		free: 'Free'
	};
</script>

<div class="flex gap-1 rounded-lg bg-gray-800 p-1">
	{#each TIER_NAMES as tier (tier)}
		<button
			class="rounded-md px-4 py-2 text-sm font-medium transition-colors {value === tier
				? 'bg-indigo-600 text-white'
				: 'text-gray-400 hover:text-white'}"
			{disabled}
			onclick={() => onchange(tier)}
		>
			{tierLabels[tier]}
		</button>
	{/each}
</div>
