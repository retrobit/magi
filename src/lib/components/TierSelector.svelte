<script lang="ts">
	import type { TierName } from '$lib/magi/types';

	interface Props {
		value: TierName;
		onchange: (tier: TierName) => void;
		disabled?: boolean;
	}

	let { value, onchange, disabled = false }: Props = $props();

	const tiers: { name: TierName; label: string }[] = [
		{ name: 'frontier', label: 'Frontier' },
		{ name: 'balanced', label: 'Balanced' },
		{ name: 'budget', label: 'Budget' }
	];
</script>

<div class="flex gap-1 rounded-lg bg-gray-800 p-1">
	{#each tiers as tier}
		<button
			class="rounded-md px-4 py-2 text-sm font-medium transition-colors {value === tier.name
				? 'bg-indigo-600 text-white'
				: 'text-gray-400 hover:text-white'}"
			{disabled}
			onclick={() => onchange(tier.name)}
		>
			{tier.label}
		</button>
	{/each}
</div>
