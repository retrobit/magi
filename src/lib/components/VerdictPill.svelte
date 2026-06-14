<script lang="ts">
	// The debate-outcome status pill shown centred in the consensus panel header
	// (and enumerated in the dev states catalog). A rounded tag with a gradient
	// border and a soft gradient glow behind it: the consensus variant sweeps the
	// palette node triad (red→green→blue), the split variant uses the warn colour.
	import { tooltip } from '$lib/actions/tooltip';

	interface Props {
		verdict: 'consensus' | 'split';
		/** Hover/focus tooltip text. Optional — the catalog renders without one. */
		tooltipText?: string;
	}

	let { verdict, tooltipText }: Props = $props();
</script>

{#if verdict === 'consensus'}
	<span
		class="verdict-pill verdict-pill-consensus pointer-events-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-(--magi-text-secondary)"
		use:tooltip={tooltipText}
	>
		Consensus reached
	</span>
{:else}
	<span
		class="verdict-pill verdict-pill-split pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium magi-warn"
		use:tooltip={tooltipText}
	>
		Split decision <span aria-hidden="true">⚖️</span>
	</span>
{/if}

<style>
	/* Gradient border via the padding-box/border-box fill trick, plus a blurred
	   gradient ::before behind the pill for the glow. isolate + z-index:-1 keeps
	   the glow behind the pill's opaque body so only the blurred halo shows. */
	.verdict-pill {
		position: relative;
		isolation: isolate;
		border: 1px solid transparent;
	}
	.verdict-pill::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		z-index: -1;
		pointer-events: none;
		filter: blur(6px);
		opacity: 0.55;
	}
	.verdict-pill-consensus {
		--pill-grad: linear-gradient(
			90deg,
			var(--magi-node-red),
			var(--magi-node-green),
			var(--magi-node-blue)
		);
		background:
			linear-gradient(var(--magi-surface-bg), var(--magi-surface-bg)) padding-box,
			var(--pill-grad) border-box;
	}
	.verdict-pill-consensus::before {
		background: var(--pill-grad);
	}
	.verdict-pill-split {
		background:
			linear-gradient(var(--magi-surface-bg), var(--magi-surface-bg)) padding-box,
			var(--magi-color-warn) border-box;
	}
	.verdict-pill-split::before {
		background: var(--magi-color-warn);
		opacity: 0.4;
	}
</style>
