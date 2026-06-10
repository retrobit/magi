<script lang="ts">
	// A compact 3-segment control for the focus accordion. The same control lives
	// in both the node panels and the consensus panel, so any of the three layout
	// states is one click away from either zone. The arrow points the way the
	// shared divider travels: expanding the nodes pushes it down, expanding the
	// consensus pushes it up — so down = expand nodes, up = expand consensus.
	import { PanelTop, PanelBottom, Rows2 } from 'lucide-svelte';
	import { tooltip } from '$lib/actions/tooltip';

	type LayoutFocus = 'balanced' | 'nodes' | 'consensus';

	interface Props {
		focus: LayoutFocus;
		onchange: (focus: LayoutFocus) => void;
	}

	let { focus, onchange }: Props = $props();

	// Each glyph depicts the layout it produces: nodes fill the top zone,
	// balanced splits the rows, consensus fills the bottom. `label` doubles as
	// the accessible name and the hover tooltip.
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
				<PanelTop size={14} />
			{:else if opt.value === 'balanced'}
				<Rows2 size={14} />
			{:else}
				<PanelBottom size={14} />
			{/if}
		</button>
	{/each}
</div>
