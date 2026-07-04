<script lang="ts">
	import { TIER_NAMES, type TierName } from '$lib/magi/types';
	import { tooltip } from '$lib/actions/tooltip';
	import { tick } from 'svelte';

	interface Props {
		value: TierName;
		onchange: (tier: TierName) => void;
		disabled?: boolean;
		/** Increment to pulse a slow highlight on the active pill — the demo tier
		 *  guard uses it to draw the eye to Free instead of shaking the control. */
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
	// ref is available), and whenever the container resizes — a late web-font swap
	// or layout reflow shifts a button, which would otherwise strand the pill.
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

	// A slow amber highlight-pulse on the active pill each time `nudge` bumps —
	// a gentle "this is your lane" cue toward Free, not a rejecting head-shake.
	// WAAPI (not a CSS class) so a rapid re-click restarts it cleanly; amber ties
	// it to the preview note beside it. Suppressed when motion is reduced.
	let pulseAnim: Animation | undefined;
	$effect(() => {
		if (nudge <= 0 || !indicatorEl) return;
		const reduced =
			window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
			document.documentElement.classList.contains('reduce-motion');
		if (reduced) return;
		pulseAnim?.cancel();
		pulseAnim = indicatorEl.animate(
			[
				{ boxShadow: '0 0 0 0 rgba(245, 158, 11, 0.5)' },
				{ boxShadow: '0 0 0 7px rgba(245, 158, 11, 0)' }
			],
			{ duration: 700, iterations: 2, easing: 'ease-out' }
		);
	});
</script>

<div
	bind:this={containerEl}
	class="magi-tier-selector relative flex items-center rounded-lg bg-(--magi-surface-bg) p-1"
>
	<!-- Sliding active indicator -->
	<div
		bind:this={indicatorEl}
		class="tier-indicator pointer-events-none absolute top-1 bottom-1 rounded-md bg-(--magi-btn-bg)"
		class:animate={ready}
		style:left="{pill.left}px"
		style:width="{pill.width}px"
		aria-hidden="true"
	></div>

	<!-- Free tier -->
	<div class="flex gap-1">
		{#each freeTiers as tier (tier)}
			<button
				bind:this={buttonEls[tier]}
				class="relative z-10 rounded-md px-3 py-1.5 magi-label-muted transition-colors {value ===
				tier
					? 'text-white'
					: 'text-(--magi-text-muted) hover:text-(--magi-text)'}"
				{disabled}
				aria-pressed={value === tier}
				onclick={() => onchange(tier)}
				use:tooltip={tierTooltips[tier]}
			>
				{tierLabels[tier]}
			</button>
		{/each}
	</div>

	<!-- Separator -->
	<div class="relative z-10 mx-1 h-6 w-px bg-(--magi-control-border)"></div>

	<!-- Paid tiers -->
	<div class="flex gap-1">
		{#each paidTiers as tier (tier)}
			<button
				bind:this={buttonEls[tier]}
				class="relative z-10 rounded-md px-3 py-1.5 magi-label-muted transition-colors {value ===
				tier
					? 'text-white'
					: 'text-(--magi-text-muted) hover:text-(--magi-text)'}"
				{disabled}
				aria-pressed={value === tier}
				onclick={() => onchange(tier)}
				use:tooltip={tierTooltips[tier]}
			>
				{tierLabels[tier]}
			</button>
		{/each}
	</div>
</div>

<style>
	/* Slide only after the first measure (`animate`), and hold still entirely
	   when motion is reduced — OS preference or the in-app class on <html>. */
	.tier-indicator {
		transition: none;
	}
	.tier-indicator.animate {
		transition:
			left 220ms ease,
			width 220ms ease;
	}
	@media (prefers-reduced-motion: reduce) {
		.tier-indicator.animate {
			transition: none;
		}
	}
	:global(.reduce-motion) .tier-indicator.animate {
		transition: none;
	}
</style>
