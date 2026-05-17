<script lang="ts">
	interface Props {
		variant?: 'columns' | 'orbs' | 'off';
	}

	let { variant = 'columns' }: Props = $props();
</script>

<div class="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
	{#if variant === 'columns'}
		<div class="aurora-col aurora-red"></div>
		<div class="aurora-col aurora-green"></div>
		<div class="aurora-col aurora-blue"></div>
	{:else if variant === 'orbs'}
		<div class="aurora-blob aurora-red"></div>
		<div class="aurora-blob aurora-green"></div>
		<div class="aurora-blob aurora-blue"></div>
	{/if}
</div>

<style>
	/* Columns variant */
	.aurora-col {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 40%;
		filter: blur(100px);
		opacity: 0.12;
		will-change: transform;
	}

	.aurora-col.aurora-red {
		background: #ef4444;
		left: -5%;
		animation: drift-col-left 20s ease-in-out infinite;
	}

	.aurora-col.aurora-green {
		background: #34d399;
		left: 30%;
		animation: drift-col-center 24s ease-in-out infinite;
	}

	.aurora-col.aurora-blue {
		background: #3b82f6;
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
		border-radius: 50%;
		filter: blur(120px);
		opacity: 0.12;
		will-change: transform;
	}

	.aurora-blob.aurora-red {
		background: #ef4444;
		bottom: -5%;
		left: -10%;
		animation: drift-orb-left 24s ease-in-out infinite;
	}

	.aurora-blob.aurora-green {
		background: #34d399;
		top: -10%;
		left: 25%;
		animation: drift-orb-center 20s ease-in-out infinite;
	}

	.aurora-blob.aurora-blue {
		background: #3b82f6;
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
</style>
