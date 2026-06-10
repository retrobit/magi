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
	// Trigger ref + measured position. The menu uses `position: fixed` and
	// coordinates anchored to the trigger's bounding rect — `absolute` would
	// get clipped by ConsensusView's `overflow-hidden` root (needed for its
	// rounded internal scroll area). Fixed positioning escapes that entirely.
	let triggerEl = $state<HTMLButtonElement | null>(null);
	// Either `top` or `bottom` is set, never both — `placement === 'up'` puts
	// the menu above the trigger (anchored to its top) so it doesn't run off
	// the viewport bottom on a short window.
	let menuPos = $state<{ top?: number; bottom?: number; left: number }>({ left: 0 });

	// Rough menu height for the smart-flip decision — 4 strategies × ~50px each
	// plus padding. Re-measuring after render to be exact would mean a paint
	// flicker; an estimate just decides direction.
	const ESTIMATED_MENU_HEIGHT = 220;
	const PLACEMENT_GAP = 4;

	// Gradient-clipped text for the flagship marker — the three-MAGI triad,
	// reusing the consensus gradient rather than introducing a new accent hue.
	const gradientText = `${CONSENSUS_GRADIENT}; -webkit-background-clip: text; background-clip: text; color: transparent;`;

	function measure() {
		if (!triggerEl) return;
		const r = triggerEl.getBoundingClientRect();
		const spaceBelow = window.innerHeight - r.bottom;
		const spaceAbove = r.top;
		// Flip up when there isn't room below AND there IS room above. This
		// avoids the dumb case where both are cramped and we pick the worse one.
		const flipUp = spaceBelow < ESTIMATED_MENU_HEIGHT && spaceAbove > spaceBelow;
		menuPos = flipUp
			? { bottom: window.innerHeight - r.top + PLACEMENT_GAP, left: r.left }
			: { top: r.bottom + PLACEMENT_GAP, left: r.left };
	}

	function toggleOpen() {
		if (!open) measure();
		open = !open;
	}

	function select(s: StrategyName) {
		onchange(s);
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
	// Re-measure on resize so the menu doesn't detach from the trigger if the
	// layout reflows while it's open. Scroll inside an overflow-hidden ancestor
	// doesn't fire window scroll, but viewport scroll does — close on that
	// rather than chase the trigger.
	function onWindowScroll() {
		open = false;
	}
</script>

<svelte:window
	onkeydown={open ? onKeydown : undefined}
	onresize={open ? measure : undefined}
	onscroll={open ? onWindowScroll : undefined}
/>

<div class="inline-block">
	<button
		type="button"
		bind:this={triggerEl}
		class="magi-select flex items-center gap-1 rounded py-0.5 pr-1.5 pl-2 text-xs focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		onclick={toggleOpen}
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
			class="fixed z-50 flex w-72 flex-col gap-0.5 magi-popover p-1"
			style:top={menuPos.top !== undefined ? `${menuPos.top}px` : undefined}
			style:bottom={menuPos.bottom !== undefined ? `${menuPos.bottom}px` : undefined}
			style:left="{menuPos.left}px"
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
							<span
								class="flex items-center gap-1 text-xs font-semibold text-(--magi-text-secondary)"
							>
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
