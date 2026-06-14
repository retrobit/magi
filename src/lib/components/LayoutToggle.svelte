<script lang="ts">
	// A compact segmented control for the focus accordion. The same control lives
	// in both the node panels and the consensus panel, so any layout state is one
	// click away from either zone. Each glyph mirrors the resulting layout: the
	// node panels sit ABOVE the consensus, so expanding the nodes leaves the
	// consensus as a thin strip at the bottom (Lucide PanelBottom = big top area +
	// bottom bar), and expanding the consensus leaves the nodes as a thin strip at
	// the top (PanelTop = top bar + big area below). The leading "Auto" segment
	// hands the layout back to the run lifecycle (nodes → balanced → consensus).
	import { PanelTop, PanelBottom, Rows2, Wand2 } from 'lucide-svelte';
	import { tooltip } from '$lib/actions/tooltip';

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
</script>

<div class="flex items-center gap-0.5 rounded bg-gray-800/60 p-0.5">
	{#each options as opt (opt.value)}
		<button
			type="button"
			class="flex items-center justify-center rounded p-1.5 transition-colors {selected ===
			opt.value
				? 'bg-gray-600 text-white'
				: 'text-gray-500 hover:text-gray-300'}"
			onclick={() => onchange(opt.value)}
			aria-label={opt.label}
			aria-pressed={selected === opt.value}
			use:tooltip={opt.label}
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
