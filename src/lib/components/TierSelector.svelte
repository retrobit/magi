<script lang="ts">
	import { TIER_NAMES, type TierName } from '$lib/magi/types';
	import { tooltip } from '$lib/actions/tooltip';
	import { prefersReducedMotion } from '$lib/motion';
	import { createSlidingPill } from '$lib/sliding-pill.svelte';

	interface Props {
		value: TierName;
		onchange: (tier: TierName) => void;
		disabled?: boolean;
		/** Increment to shake the active pill — a scoped ~1250ms head-shake the demo
		 *  tier guard uses to draw the eye to Free without shaking the whole control. */
		nudge?: number;
	}

	let { value, onchange, disabled = false, nudge = 0 }: Props = $props();

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

	const tierTooltips: Record<TierName, string> = {
		frontier: 'Frontier — the most capable model from each provider.',
		balanced: 'Balanced — strong models that weigh quality against cost.',
		budget: 'Budget — cheaper, faster models for everyday questions.',
		free: 'Free — no-cost models via OpenRouter; can be slower or flakier.'
	};

	// A single pill slides to whichever tier is active — across the free/paid
	// separator and all — instead of each button toggling its own background.
	let containerEl = $state<HTMLDivElement>();
	let indicatorEl = $state<HTMLDivElement>();
	let buttonEls = $state<Partial<Record<TierName, HTMLButtonElement>>>({});
	const pill = createSlidingPill({
		containerEl: () => containerEl,
		activeEl: () => buttonEls[value]
	});

	// Shake just the active pill (the Free highlight) each time `nudge` bumps — a
	// slower head-shake scoped to the highlight rather than the whole control.
	// Animates the individual `translate` property, which composes with the pill's
	// `transform: translateX(…)` positioning instead of replacing it; restarts
	// cleanly on a rapid re-click; suppressed when motion is reduced.
	let nudgeAnim: Animation | undefined;
	$effect(() => {
		if (nudge <= 0 || !indicatorEl || prefersReducedMotion()) return;
		nudgeAnim?.cancel();
		nudgeAnim = indicatorEl.animate(
			[
				{ translate: '0', offset: 0 },
				{ translate: '-4px', offset: 0.15 },
				{ translate: '4px', offset: 0.3 },
				{ translate: '-3px', offset: 0.45 },
				{ translate: '3px', offset: 0.6 },
				{ translate: '-4px', offset: 0.75 },
				{ translate: '4px', offset: 0.9 },
				{ translate: '0', offset: 1 }
			],
			{ duration: 1250, easing: 'ease' }
		);
	});
</script>

{#snippet tierButton(tier: TierName)}
	<button
		bind:this={buttonEls[tier]}
		class="relative z-10 rounded-md px-3 py-1.5 magi-label-muted transition-colors {value === tier
			? 'text-white'
			: 'text-(--magi-text-muted) hover:text-(--magi-text)'}"
		{disabled}
		aria-pressed={value === tier}
		onclick={() => onchange(tier)}
		use:tooltip={tierTooltips[tier]}
	>
		{tierLabels[tier]}
	</button>
{/snippet}

<div
	bind:this={containerEl}
	class="magi-tier-selector relative flex items-center rounded-lg bg-(--magi-surface-bg) p-1"
>
	<!-- Sliding active indicator -->
	<div
		bind:this={indicatorEl}
		class="magi-pill pointer-events-none absolute top-1 bottom-1 left-0 rounded-md bg-(--magi-btn-bg)"
		class:animate={pill.ready}
		style:transform="translateX({pill.x}px)"
		style:width="{pill.width}px"
		aria-hidden="true"
	></div>

	<!-- Free tier -->
	<div class="flex gap-1">
		{#each freeTiers as tier (tier)}
			{@render tierButton(tier)}
		{/each}
	</div>

	<!-- Separator -->
	<div class="relative z-10 mx-1 h-6 w-px bg-(--magi-control-border)"></div>

	<!-- Paid tiers -->
	<div class="flex gap-1">
		{#each paidTiers as tier (tier)}
			{@render tierButton(tier)}
		{/each}
	</div>
</div>
