<script lang="ts">
	// A compact 3-segment control for the focus accordion. The same control lives
	// in both the node panels and the consensus panel, so any of the three layout
	// states is one click away from either zone. The arrow points the way the
	// shared divider travels: expanding the nodes pushes it down, expanding the
	// consensus pushes it up — so down = expand nodes, up = expand consensus.
	import { ChevronUp, ChevronDown, Rows2 } from 'lucide-svelte';

	type LayoutFocus = 'balanced' | 'nodes' | 'consensus';

	interface Props {
		focus: LayoutFocus;
		onchange: (focus: LayoutFocus) => void;
	}

	let { focus, onchange }: Props = $props();

	// Ordered so the arrows read ▲ ▭ ▼ top-to-bottom. The up arrow (left) expands
	// the consensus, the down arrow (right) expands the nodes — the direction the
	// shared divider travels. `label` is the accessible name only (no hover tooltip).
	const options: { value: LayoutFocus; label: string }[] = [
		{ value: 'consensus', label: 'Expand the consensus panel' },
		{ value: 'balanced', label: 'Balanced — node panels and consensus together' },
		{ value: 'nodes', label: 'Expand the MAGI node panels' }
	];
</script>

<div class="flex items-center gap-0.5 rounded bg-gray-800/60 p-0.5">
	{#each options as opt (opt.value)}
		<button
			type="button"
			class="flex items-center justify-center rounded px-1 py-0.5 transition-colors {focus ===
			opt.value
				? 'bg-gray-600 text-white'
				: 'text-gray-500 hover:text-gray-300'}"
			onclick={() => onchange(opt.value)}
			aria-label={opt.label}
			aria-pressed={focus === opt.value}
		>
			{#if opt.value === 'nodes'}
				<ChevronDown size={12} />
			{:else if opt.value === 'balanced'}
				<Rows2 size={12} />
			{:else}
				<ChevronUp size={12} />
			{/if}
		</button>
	{/each}
</div>
