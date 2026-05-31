<script lang="ts">
	import { TIER_NAMES, type TierName } from '$lib/magi/types';

	interface Props {
		value: TierName;
		onchange: (tier: TierName) => void;
		disabled?: boolean;
	}

	let { value, onchange, disabled = false }: Props = $props();

	// Derived from TIER_NAMES (single source of truth in types.ts) so a new
	// tier added there shows up here without manual array maintenance.
	const FREE_TIERS = new Set<TierName>(['free']);
	const freeTiers: TierName[] = TIER_NAMES.filter((t) => FREE_TIERS.has(t));
	const paidTiers: TierName[] = TIER_NAMES.filter((t) => !FREE_TIERS.has(t));

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
