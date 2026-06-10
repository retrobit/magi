<script lang="ts">
	// A compact 3-segment control for the focus accordion. The same control lives
	// in both the node panels and the consensus panel, so any of the three layout
	// states is one click away from either zone. Each glyph mirrors the resulting
	// layout: the node panels sit ABOVE the consensus, so expanding the nodes
	// leaves the consensus as a thin strip at the bottom (Lucide PanelBottom =
	// big top area + bottom bar), and expanding the consensus leaves the nodes as
	// a thin strip at the top (PanelTop = top bar + big area below).
	import { PanelTop, PanelBottom, Rows2 } from 'lucide-svelte';
	import { tooltip } from '$lib/actions/tooltip';

	type LayoutFocus = 'balanced' | 'nodes' | 'consensus';

	interface Props {
		focus: LayoutFocus;
		onchange: (focus: LayoutFocus) => void;
	}

	let { focus, onchange }: Props = $props();

	// `label` doubles as the accessible name and the hover tooltip.
	const options: { value: LayoutFocus; label: string }[] = [
		{ value: 'nodes', label: 'Expand the MAGI node panels' },
		{ value: 'balanced', label: 'Balanced — node panels and consensus together' },
		{ value: 'consensus', label: 'Expand the consensus panel' }
	];
</script>

<div class="flex items-center gap-0.5 rounded bg-gray-800/60 p-0.5">
	{#each options as opt (opt.value)}
		<button
			type="button"
			class="flex items-center justify-center rounded p-1.5 transition-colors {focus === opt.value
				? 'bg-gray-600 text-white'
				: 'text-gray-500 hover:text-gray-300'}"
			onclick={() => onchange(opt.value)}
			aria-label={opt.label}
			aria-pressed={focus === opt.value}
			use:tooltip={opt.label}
		>
			{#if opt.value === 'nodes'}
				<PanelBottom size={14} />
			{:else if opt.value === 'balanced'}
				<Rows2 size={14} />
			{:else}
				<PanelTop size={14} />
			{/if}
		</button>
	{/each}
</div>
