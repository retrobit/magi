<script lang="ts">
	import { TIER_NAMES, type TierName } from '$lib/magi/types';
	import { tick } from 'svelte';

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

	// A single pill slides to whichever tier is active — across the free/paid
	// separator and all — instead of each button toggling its own background.
	let containerEl = $state<HTMLDivElement>();
	let buttonEls = $state<Partial<Record<TierName, HTMLButtonElement>>>({});
	let pill = $state({ left: 0, width: 0 });
	// Suppressed for the first paint so the pill appears in place rather than
	// sliding in from the left edge on load.
	let ready = $state(false);

	function measure() {
		const btn = buttonEls[value];
		if (!btn || !containerEl) return;
		const c = containerEl.getBoundingClientRect();
		const r = btn.getBoundingClientRect();
		pill = { left: r.left - c.left, width: r.width };
	}

	// Re-place when the active tier changes (await tick so a just-mounted button
	// ref is available), and whenever the container resizes — the buttons grow
	// at the `sm` breakpoint, which would otherwise leave the pill misaligned.
	$effect(() => {
		void value;
		tick().then(() => {
			measure();
			ready = true;
		});
	});

	$effect(() => {
		if (!containerEl) return;
		const ro = new ResizeObserver(() => measure());
		ro.observe(containerEl);
		return () => ro.disconnect();
	});
</script>

<div
	bind:this={containerEl}
	class="magi-tier-selector relative flex items-center rounded-lg bg-gray-800 p-1"
>
	<!-- Sliding active indicator -->
	<div
		class="pointer-events-none absolute top-1 bottom-1 rounded-md bg-gray-600"
		style:left="{pill.left}px"
		style:width="{pill.width}px"
		style:transition={ready ? 'transform 220ms ease, left 220ms ease, width 220ms ease' : 'none'}
		aria-hidden="true"
	></div>

	<!-- Free tier -->
	<div class="flex gap-1">
		{#each freeTiers as tier (tier)}
			<button
				bind:this={buttonEls[tier]}
				class="relative z-10 rounded-md px-3 py-1.5 magi-label-muted transition-colors sm:px-4 sm:py-2 sm:text-sm {value ===
				tier
					? 'text-white'
					: 'text-gray-400 hover:text-white'}"
				{disabled}
				onclick={() => onchange(tier)}
			>
				{tierLabels[tier]}
			</button>
		{/each}
	</div>

	<!-- Separator -->
	<div class="relative z-10 mx-1 h-6 w-px bg-gray-600"></div>

	<!-- Paid tiers -->
	<div class="flex gap-1">
		{#each paidTiers as tier (tier)}
			<button
				bind:this={buttonEls[tier]}
				class="relative z-10 rounded-md px-3 py-1.5 magi-label-muted transition-colors sm:px-4 sm:py-2 sm:text-sm {value ===
				tier
					? 'text-white'
					: 'text-gray-400 hover:text-white'}"
				{disabled}
				onclick={() => onchange(tier)}
			>
				{tierLabels[tier]}
			</button>
		{/each}
	</div>
</div>
