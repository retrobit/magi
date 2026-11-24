<script lang="ts">
	// A compact segmented control for the focus accordion. The same control lives
	// in both the node panels and the consensus panel, so any layout state is one
	// click away from either zone. Each glyph mirrors the resulting layout: the
	// node panels sit ABOVE the consensus, so expanding the nodes leaves the
	// consensus as a thin strip at the bottom (Lucide PanelBottom = big top area +
	// bottom bar), and expanding the consensus leaves the nodes as a thin strip at
	// the top (PanelTop = top bar + big area below). The leading "Auto" segment
	// hands the layout back to the run lifecycle (nodes → balanced → consensus) and
	// is set off by a separator, mirroring the tier selector's free/paid divider.
	import { PanelTop, PanelBottom, Rows2, Wand2 } from 'lucide-svelte';
	import { tooltip } from '$lib/actions/tooltip';
	import { createSlidingPill } from '$lib/sliding-pill.svelte';

	type LayoutFocus = 'balanced' | 'nodes' | 'consensus';
	type LayoutChoice = 'auto' | LayoutFocus;

	interface Props {
		focus: LayoutFocus;
		/** When true, the layout is being driven automatically — the Auto segment is
		 *  highlighted rather than the current focus. */
		auto: boolean;
		onchange: (choice: LayoutChoice) => void;
	}

	let { focus, auto, onchange }: Props = $props();

	// In auto mode the Auto segment is the "selected" one even though `focus` still
	// reflects the live layout the lifecycle drove it to.
	const selected = $derived<LayoutChoice>(auto ? 'auto' : focus);

	// `label` doubles as the accessible name and the hover tooltip.
	const options: { value: LayoutChoice; label: string }[] = [
		{
			value: 'auto',
			label:
				'Auto layout — follow the run: node panels while they think, balanced while the consensus streams, consensus when it lands'
		},
		{ value: 'nodes', label: 'Expand the MAGI node panels' },
		{ value: 'balanced', label: 'Balanced — node panels and consensus together' },
		{ value: 'consensus', label: 'Expand the consensus panel' }
	];

	// A single pill slides to whichever segment is active — across the Auto
	// separator and all — instead of each button toggling its own background, to
	// match the tier selector (shared via createSlidingPill).
	let containerEl = $state<HTMLDivElement>();
	let buttonEls = $state<Partial<Record<LayoutChoice, HTMLButtonElement>>>({});
	const pill = createSlidingPill({
		containerEl: () => containerEl,
		activeEl: () => buttonEls[selected]
	});
</script>

<div
	bind:this={containerEl}
	class="relative flex items-center gap-0.5 rounded bg-(--magi-surface-bg) p-0.5"
>
	<!-- Sliding active indicator -->
	<div
		class="magi-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded bg-(--magi-btn-bg)"
		class:animate={pill.ready}
		style:transform="translateX({pill.x}px)"
		style:width="{pill.width}px"
		aria-hidden="true"
	></div>

	{#each options as opt, i (opt.value)}
		{#if i === 1}
			<!-- Separator setting Auto apart from the manual focus segments. -->
			<div
				class="relative z-10 mx-0.5 h-5 w-px bg-(--magi-control-border)"
				aria-hidden="true"
			></div>
		{/if}
		<button
			bind:this={buttonEls[opt.value]}
			type="button"
			class="relative z-10 flex items-center justify-center rounded p-1.5 transition-colors {selected ===
			opt.value
				? 'text-white'
				: 'text-(--magi-text-muted) hover:text-(--magi-text-secondary)'}"
			onclick={() => onchange(opt.value)}
			aria-label={opt.label}
			aria-pressed={selected === opt.value}
			use:tooltip={opt.value === 'auto' ? opt.label : undefined}
		>
			{#if opt.value === 'auto'}
				<Wand2 size={14} />
			{:else if opt.value === 'nodes'}
				<PanelBottom size={14} />
			{:else if opt.value === 'balanced'}
				<Rows2 size={14} />
			{:else}
				<PanelTop size={14} />
			{/if}
		</button>
	{/each}
</div>
