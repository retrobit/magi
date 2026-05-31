<script lang="ts">
	import type { TierName } from '$lib/magi/types';

	interface Props {
		value: TierName;
		onchange: (tier: TierName) => void;
		disabled?: boolean;
	}

	let { value, onchange, disabled = false }: Props = $props();

	const freeTiers: TierName[] = ['free'];
	const paidTiers: TierName[] = ['budget', 'balanced', 'frontier'];

	const tierLabels: Record<TierName, string> = {
		frontier: 'Frontier',
		balanced: 'Balanced',
		budget: 'Budget',
		free: 'Free'
	};
</script>

<div class="magi-tier-selector flex items-center rounded-lg bg-gray-800 p-1">
	<!-- Free tier -->
	<div class="flex gap-1">
		{#each freeTiers as tier (tier)}
			<button
				class="rounded-md px-3 py-1.5 magi-label-muted transition-colors sm:px-4 sm:py-2 sm:text-sm {value ===
				tier
					? 'magi-tier-active bg-gray-600 text-white'
					: 'bg-gray-700/50 text-gray-400 hover:text-white'}"
				{disabled}
				onclick={() => onchange(tier)}
			>
				{tierLabels[tier]}
			</button>
		{/each}
	</div>

	<!-- Separator -->
	<div class="mx-1 h-6 w-px bg-gray-600"></div>

	<!-- Paid tiers -->
	<div class="flex gap-1">
		{#each paidTiers as tier (tier)}
			<button
				class="rounded-md px-3 py-1.5 magi-label-muted transition-colors sm:px-4 sm:py-2 sm:text-sm {value ===
				tier
					? 'magi-tier-active bg-gray-600 text-white'
					: 'text-gray-400 hover:text-white'}"
				{disabled}
				onclick={() => onchange(tier)}
			>
				{tierLabels[tier]}
			</button>
		{/each}
	</div>
</div>
