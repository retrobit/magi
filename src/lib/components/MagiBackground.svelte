<div class="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
	<div class="aurora-blob aurora-orange"></div>
	<div class="aurora-blob aurora-blue"></div>
	<div class="aurora-blob aurora-emerald"></div>
</div>

<style>
	.aurora-blob {
		position: absolute;
		width: 50%;
		height: 50%;
		border-radius: 50%;
		filter: blur(120px);
		opacity: 0.12;
		will-change: transform;
	}

	.aurora-orange {
		background: #f97316;
		top: -10%;
		left: 25%;
		animation: drift-orange 20s ease-in-out infinite;
	}

	.aurora-blue {
		background: #3b82f6;
		bottom: -5%;
		left: -10%;
		animation: drift-blue 24s ease-in-out infinite;
	}

	.aurora-emerald {
		background: #34d399;
		bottom: -5%;
		right: -10%;
		animation: drift-emerald 22s ease-in-out infinite;
	}

	@keyframes drift-orange {
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

	@keyframes drift-blue {
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

	@keyframes drift-emerald {
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
