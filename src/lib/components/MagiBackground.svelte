<script lang="ts">
	interface Props {
		variant?: 'columns' | 'orbs' | 'off';
	}

	let { variant = 'columns' }: Props = $props();
</script>

{#if variant !== 'off'}
	<!-- `fixed` (not `absolute`) so the background stays anchored to the viewport
	     on mobile, where the outer container scrolls. Foreground siblings still
	     stack above it via the `.magi-bg > *:not([aria-hidden])` z-index rule. -->
	<div class="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
		{#if variant === 'columns'}
			<div class="aurora-col aurora-red"></div>
			<div class="aurora-col aurora-green"></div>
			<div class="aurora-col aurora-blue"></div>
		{:else}
			<div class="aurora-blob aurora-red"></div>
			<div class="aurora-blob aurora-green"></div>
			<div class="aurora-blob aurora-blue"></div>
		{/if}
	</div>
{/if}

<style>
	/* The soft glow comes from gradients that fade to transparent — NOT from
	   `filter: blur()`. A large-radius blur on a half-viewport element is
	   re-rasterized every animation frame (and isn't reliably GPU-accelerated on
	   WebKit/macOS), which pegged a CPU core for as long as the app stayed open.
	   A pre-faded gradient is painted once; the drift animation below only moves
	   that cached layer via `transform`, which the compositor handles cheaply. */

	/* Columns variant */
	.aurora-col {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 40%;
		opacity: 0.12;
		will-change: transform;
	}

	.aurora-col.aurora-red {
		background: linear-gradient(to right, transparent, #ef4444, transparent);
		left: -5%;
		animation: drift-col-left 20s ease-in-out infinite;
	}

	.aurora-col.aurora-green {
		background: linear-gradient(to right, transparent, #34d399, transparent);
		left: 30%;
		animation: drift-col-center 24s ease-in-out infinite;
	}

	.aurora-col.aurora-blue {
		background: linear-gradient(to right, transparent, #3b82f6, transparent);
		right: -5%;
		animation: drift-col-right 22s ease-in-out infinite;
	}

	@keyframes drift-col-left {
		0%,
		100% {
			transform: translateX(0) scaleX(1);
		}
		50% {
			transform: translateX(5%) scaleX(1.1);
		}
	}

	@keyframes drift-col-center {
		0%,
		100% {
			transform: translateX(0) scaleX(1);
		}
		50% {
			transform: translateX(-3%) scaleX(0.9);
		}
	}

	@keyframes drift-col-right {
		0%,
		100% {
			transform: translateX(0) scaleX(1);
		}
		50% {
			transform: translateX(-5%) scaleX(1.1);
		}
	}

	/* Orbs variant */
	.aurora-blob {
		position: absolute;
		width: 50%;
		height: 50%;
		opacity: 0.12;
		will-change: transform;
	}

	.aurora-blob.aurora-red {
		background: radial-gradient(circle, #ef4444 0%, transparent 70%);
		bottom: -5%;
		left: -10%;
		animation: drift-orb-left 24s ease-in-out infinite;
	}

	.aurora-blob.aurora-green {
		background: radial-gradient(circle, #34d399 0%, transparent 70%);
		top: -10%;
		left: 25%;
		animation: drift-orb-center 20s ease-in-out infinite;
	}

	.aurora-blob.aurora-blue {
		background: radial-gradient(circle, #3b82f6 0%, transparent 70%);
		bottom: -5%;
		right: -10%;
		animation: drift-orb-right 22s ease-in-out infinite;
	}

	@keyframes drift-orb-left {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		33% {
			transform: translate(15%, -10%) scale(1.15);
		}
		66% {
			transform: translate(5%, -20%) scale(0.95);
		}
	}

	@keyframes drift-orb-center {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		33% {
			transform: translate(10%, 15%) scale(1.1);
		}
		66% {
			transform: translate(-8%, 5%) scale(0.9);
		}
	}

	@keyframes drift-orb-right {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		33% {
			transform: translate(-12%, -15%) scale(1.1);
		}
		66% {
			transform: translate(-5%, -8%) scale(0.9);
		}
	}

	/* Honor a reduced-motion preference by holding the aurora still. With the
	   drift stopped the gradients are pure static paints — zero per-frame cost. */
	@media (prefers-reduced-motion: reduce) {
		.aurora-col,
		.aurora-blob {
			animation: none;
		}
	}
</style>
