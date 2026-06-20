<script lang="ts">
	import {
		STRATEGY_NAMES,
		STRATEGY_LABELS,
		STRATEGY_DESCRIPTIONS,
		STRATEGY_INTENSITY,
		FLAGSHIP_STRATEGY,
		type StrategyName
	} from '$lib/magi/consensus';
	import { tooltip } from '$lib/actions/tooltip';
	import { Check } from 'lucide-svelte';

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
	let menuPos = $state<{ top?: number; bottom?: number; left: number; maxHeight: number }>({
		left: 0,
		maxHeight: 0
	});

	// Rough menu height for the smart-flip decision — 4 strategies × ~50px each
	// plus padding. Re-measuring after render to be exact would mean a paint
	// flicker; an estimate just decides direction.
	const ESTIMATED_MENU_HEIGHT = 220;
	const PLACEMENT_GAP = 4;

	// The flagship strategy (Multi-Round Debate) has intensity 3, so its dot
	// meter is full — those three dots are painted in the three-MAGI node colors
	// (one dot per node) rather than neutral gray, tying the meter to the triad.
	const NODE_DOT_COLORS = ['--magi-node-red', '--magi-node-green', '--magi-node-blue'] as const;

	function measure() {
		if (!triggerEl) return;
		const r = triggerEl.getBoundingClientRect();
		const spaceBelow = window.innerHeight - r.bottom;
		const spaceAbove = r.top;
		// Flip up when there isn't room below AND there IS room above. This
		// avoids the dumb case where both are cramped and we pick the worse one.
		const flipUp = spaceBelow < ESTIMATED_MENU_HEIGHT && spaceAbove > spaceBelow;
		// Cap the menu to the space in the chosen direction (less an 8px margin)
		// and let it scroll — otherwise a trigger low in a short viewport clips
		// the last strategy off the bottom with no way to reach it.
		const maxHeight = Math.max(120, (flipUp ? spaceAbove : spaceBelow) - PLACEMENT_GAP - 8);
		menuPos = flipUp
			? { bottom: window.innerHeight - r.top + PLACEMENT_GAP, left: r.left, maxHeight }
			: { top: r.bottom + PLACEMENT_GAP, left: r.left, maxHeight };
	}

	function toggleOpen() {
		if (!open) measure();
		open = !open;
	}

	function select(s: StrategyName) {
		onchange(s);
		open = false;
		triggerEl?.focus();
	}

	// APG listbox keyboard model: roving DOM focus across the option buttons.
	// Each option is a real <button> (Enter/Space already select via onclick), so
	// arrow/Home/End just move focus and the native activation does the rest.
	let optionRefs: HTMLButtonElement[] = [];

	function focusOption(i: number) {
		const idx = Math.max(0, Math.min(STRATEGY_NAMES.length - 1, i));
		optionRefs[idx]?.focus();
	}

	// On open, move focus to the currently-selected option so arrow keys work
	// immediately and assistive tech announces the active choice.
	$effect(() => {
		if (open) focusOption(Math.max(0, STRATEGY_NAMES.indexOf(strategy)));
	});

	function onMenuKeydown(e: KeyboardEvent) {
		const current = optionRefs.findIndex((el) => el === document.activeElement);
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusOption(current + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusOption(current - 1);
		} else if (e.key === 'Home') {
			e.preventDefault();
			focusOption(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			focusOption(STRATEGY_NAMES.length - 1);
		}
	}

	// Down/Up on the closed trigger opens the menu (the $effect then lands focus
	// on the selected option) — the standard collapsed-listbox affordance.
	function onTriggerKeydown(e: KeyboardEvent) {
		if (disabled || open) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			measure();
			open = true;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			triggerEl?.focus();
		}
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
		class="magi-select flex items-center gap-1 focus:ring-1 focus:ring-gray-500 focus:outline-none"
		onclick={toggleOpen}
		onkeydown={onTriggerKeydown}
		{disabled}
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		<span>
			{#if strategy === FLAGSHIP_STRATEGY}<span aria-hidden="true" class="mr-1">✦</span
				>{/if}{STRATEGY_LABELS[strategy]}
		</span>
	</button>

	{#if open}
		<!-- Transparent backdrop catches outside clicks (same pattern as the stats panel). -->
		<button
			class="fixed inset-0 z-40 cursor-default"
			onclick={() => (open = false)}
			aria-label="Close strategy picker"
		></button>
		<div
			class="fixed z-50 flex w-72 flex-col gap-0.5 overflow-y-auto magi-popover p-1"
			style:top={menuPos.top !== undefined ? `${menuPos.top}px` : undefined}
			style:bottom={menuPos.bottom !== undefined ? `${menuPos.bottom}px` : undefined}
			style:left="{menuPos.left}px"
			style:max-height="{menuPos.maxHeight}px"
			role="listbox"
			aria-label="Consensus strategy"
			tabindex={-1}
			onkeydown={onMenuKeydown}
		>
			{#each STRATEGY_NAMES as s, i (s)}
				{@const flagship = s === FLAGSHIP_STRATEGY}
				{@const selected = s === strategy}
				<button
					type="button"
					role="option"
					bind:this={optionRefs[i]}
					aria-selected={selected}
					class="relative flex w-full items-start gap-2 rounded py-1.5 pr-2 pl-2 text-left transition-colors hover:bg-(--magi-surface-hover) {selected
						? 'bg-(--magi-surface-hover)'
						: ''}"
					onclick={() => select(s)}
				>
					<div class="min-w-0 flex-1">
						<div class="flex items-center justify-between gap-2">
							<span
								class="flex items-center gap-1 text-xs font-semibold text-(--magi-text-secondary)"
							>
								{STRATEGY_LABELS[s]}
								{#if flagship}
									<span class="magi-badge text-(--magi-text-muted)">✦ Flagship</span>
								{/if}
							</span>
							<!-- Selected check + relative cost meter. The check sits to the
							     LEFT of the dots so toggling selection never shifts the meter —
							     the dots stay anchored to the row's right edge in every row. -->
							<span class="flex shrink-0 items-center gap-1.5">
								{#if selected}
									<Check size={13} class="magi-success" />
								{/if}
								<span
									class="flex items-center gap-0.5"
									use:tooltip={`${STRATEGY_INTENSITY[s]} of 3 — relative cost`}
								>
									{#each [1, 2, 3] as dot (dot)}
										{@const filled = dot <= STRATEGY_INTENSITY[s]}
										<span
											class="h-1.5 w-1.5 rounded-full {filled
												? flagship
													? ''
													: 'bg-(--magi-text-secondary)'
												: 'bg-(--magi-surface-hover)'}"
											style:background-color={filled && flagship
												? `var(${NODE_DOT_COLORS[dot - 1]})`
												: undefined}
										></span>
									{/each}
								</span>
							</span>
						</div>
						<p class="mt-0.5 magi-meta leading-snug">
							{STRATEGY_DESCRIPTIONS[s]}
						</p>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
