<script lang="ts">
	// Shown in a panel header while its model is visibly thinking and has not
	// started answering. The elapsed counter reassures through long thinks (some
	// free models think for 30–60 s). Screen readers hear "Thinking" once, on
	// insertion — the ticking counter is hidden from them.
	import { onDestroy } from 'svelte';
	import { Lightbulb } from 'lucide-svelte';

	interface Props {
		/** Epoch ms when the thinking signal arrived. */
		since: number;
	}
	let { since }: Props = $props();

	let now = $state(Date.now());
	const timer = setInterval(() => (now = Date.now()), 1000);
	onDestroy(() => clearInterval(timer));
	const seconds = $derived(Math.max(0, Math.floor((now - since) / 1000)));
</script>

<span
	class="magi-temperament-badge inline-flex items-center gap-1 rounded px-1.5 py-0.5 magi-chip"
	role="status"
	aria-label="Thinking"
>
	<span class="thinking-icon inline-flex" aria-hidden="true"><Lightbulb size={10} /></span>
	<span aria-hidden="true">Thinking <span class="tabular-nums">{seconds}s</span></span>
</span>

<style>
	/* A slow opacity breath on the icon only — opacity is compositor-cheap, and
	   reduced motion stills it. */
	.thinking-icon {
		animation: thinking-breathe 1.6s ease-in-out infinite;
	}
	@keyframes thinking-breathe {
		50% {
			opacity: 0.35;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.thinking-icon {
			animation: none;
		}
	}
	:global(.reduce-motion) .thinking-icon {
		animation: none;
	}
</style>
