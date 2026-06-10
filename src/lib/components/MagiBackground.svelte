<script lang="ts">
	import type { BgVariant } from '$lib/magi/types';

	interface Props {
		variant?: BgVariant;
	}

	let { variant = 'columns' }: Props = $props();

	// ── Hex variant: pointer-tracked spotlight ──────────────────────────────
	// The background container is pointer-events-none, so events can never
	// reach this subtree — tracking listens on `window` instead. The pipeline
	// is strictly event-driven: the passive pointermove handler stashes
	// coordinates into plain (non-reactive) locals and arms at most ONE rAF;
	// the callback zeroes its own handle FIRST and never re-arms, so the
	// moment the pointer stops, nothing is scheduled and idle cost is exactly
	// zero. High-Hz mice can fire several events per frame; only the rAF
	// callback touches Svelte state, so commits coalesce to one per frame.
	let spotX = $state(-9999); // parked far offscreen until the first move
	let spotY = $state(-9999);
	let spotOn = $state(false);

	let rafId = 0; // 0 = nothing scheduled — the coalescing guard
	let nextX = 0; // non-reactive staging for the latest pointer position
	let nextY = 0;

	function onPointerMove(e: PointerEvent) {
		nextX = e.clientX;
		nextY = e.clientY;
		if (rafId !== 0) return; // a commit is already scheduled for this frame
		rafId = requestAnimationFrame(() => {
			rafId = 0; // clear FIRST — this callback never re-arms itself
			spotX = nextX;
			spotY = nextY;
			spotOn = true;
		});
	}

	function onPointerOut(e: PointerEvent) {
		// Only when the pointer leaves the document entirely (relatedTarget is
		// null), not on every element boundary crossing. Drop any pending commit
		// first — its callback sets spotOn = true and would re-light the glow
		// after the pointer is gone. The glow then fades out via a finite CSS
		// opacity transition, and everything is static again.
		if (e.relatedTarget !== null) return;
		if (rafId !== 0) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}
		spotOn = false;
	}

	// Capability gates, kept live via `change` listeners so toggling the OS
	// reduced-motion setting or docking/undocking a convertible takes effect
	// without a reload. When either gate fails, the pointer listener is never
	// attached AND the glow rect is not rendered — the hex variant degrades to
	// a pure static lattice: one paint, ever.
	let hoverOk = $state(false);
	let motionOk = $state(false);

	$effect(() => {
		if (variant !== 'hex') return;
		const hoverMq = window.matchMedia('(hover: hover) and (pointer: fine)');
		const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => {
			hoverOk = hoverMq.matches;
			motionOk = !reduceMq.matches;
		};
		update();
		hoverMq.addEventListener('change', update);
		reduceMq.addEventListener('change', update);
		return () => {
			hoverMq.removeEventListener('change', update);
			reduceMq.removeEventListener('change', update);
		};
	});

	$effect(() => {
		if (variant !== 'hex' || !hoverOk || !motionOk) return;
		window.addEventListener('pointermove', onPointerMove, { passive: true });
		window.addEventListener('pointerout', onPointerOut, { passive: true });
		return () => {
			// Re-runs when the variant changes or a gate flips mid-session: tear
			// down the listeners, drop any pending commit, and fade the glow out.
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerout', onPointerOut);
			if (rafId !== 0) cancelAnimationFrame(rafId);
			rafId = 0;
			spotOn = false;
		};
	});

	// Seamless pointy-top hex tile, circumradius R = 24: tile width √3·R ≈
	// 41.57, height 3R = 72. One hexagon outline plus one vertical connector
	// covers every honeycomb edge exactly once across the tiling: offset-row
	// zigzag edges coincide with this hexagon's lower edges, offset-row
	// verticals come from the connector in adjacent tiles, and tile-boundary
	// verticals composite from half-clipped strokes in two neighboring tiles.
	const HEX_TILE_W = 41.57;
	const HEX_TILE_H = 72;
	const HEX_PATH = 'M20.78 0 L41.57 12 L41.57 36 L20.78 48 L0 36 L0 12 Z M20.78 48 L20.78 72';
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
		{:else if variant === 'hex'}
			<!-- Retained-mode SVG honeycomb. Two rects share the same tile
			     geometry: a faint base lattice (painted once, raster cached) and
			     a brighter neutral-warm duplicate revealed through a gradient-
			     circle mask that follows the cursor. No per-cell DOM — the
			     <pattern> does the tiling. Resize is free: 100% rects plus
			     userSpaceOnUse repeat give crisp vector strokes at any DPR or
			     zoom with zero resize JS. -->
			<svg class="hex-svg" width="100%" height="100%">
				<defs>
					<pattern
						id="magi-hex-base"
						patternUnits="userSpaceOnUse"
						width={HEX_TILE_W}
						height={HEX_TILE_H}
					>
						<path d={HEX_PATH} fill="none" stroke="var(--hex-line)" stroke-width="1" />
					</pattern>
					<pattern
						id="magi-hex-hot"
						patternUnits="userSpaceOnUse"
						width={HEX_TILE_W}
						height={HEX_TILE_H}
					>
						<path d={HEX_PATH} fill="none" stroke="var(--hex-line-hot)" stroke-width="1" />
					</pattern>
					<radialGradient id="magi-hex-falloff">
						<stop offset="0%" stop-color="#fff" stop-opacity="0.9" />
						<stop offset="55%" stop-color="#fff" stop-opacity="0.35" />
						<stop offset="100%" stop-color="#fff" stop-opacity="0" />
					</radialGradient>
					<mask id="magi-hex-spot">
						<!-- Moved with a CSS transform, never by mutating circle
						     geometry attributes: geometry stays constant, so the only
						     invalidation is the mask raster — no layout. -->
						<circle
							r="260"
							fill="url(#magi-hex-falloff)"
							style:transform={`translate(${spotX}px, ${spotY}px)`}
						/>
					</mask>
				</defs>

				<!-- Base lattice: one static paint, cached by the compositor. -->
				<rect class="hex-base" width="100%" height="100%" fill="url(#magi-hex-base)" />

				<!-- Spotlight lattice: only in the DOM when a hover-capable pointer
				     exists and motion is allowed; otherwise hex stays a pure static
				     texture and this masked rect costs nothing at all. -->
				{#if hoverOk && motionOk}
					<rect
						class="hex-glow"
						class:hex-glow-on={spotOn}
						width="100%"
						height="100%"
						fill="url(#magi-hex-hot)"
						mask="url(#magi-hex-spot)"
					/>
				{/if}
			</svg>
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
		background: linear-gradient(to right, transparent, var(--magi-node-red), transparent);
		left: -5%;
		animation: drift-col-left 20s ease-in-out infinite;
	}

	.aurora-col.aurora-green {
		background: linear-gradient(to right, transparent, var(--magi-node-green), transparent);
		left: 30%;
		animation: drift-col-center 24s ease-in-out infinite;
	}

	.aurora-col.aurora-blue {
		background: linear-gradient(to right, transparent, var(--magi-node-blue), transparent);
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
		background: radial-gradient(circle, var(--magi-node-red) 0%, transparent 70%);
		bottom: -5%;
		left: -10%;
		animation: drift-orb-left 24s ease-in-out infinite;
	}

	.aurora-blob.aurora-green {
		background: radial-gradient(circle, var(--magi-node-green) 0%, transparent 70%);
		top: -10%;
		left: 25%;
		animation: drift-orb-center 20s ease-in-out infinite;
	}

	.aurora-blob.aurora-blue {
		background: radial-gradient(circle, var(--magi-node-blue) 0%, transparent 70%);
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

	/* ── Hex variant ──────────────────────────────────────────────────────────
	   An Evangelion-MAGI honeycomb rendered as a retained-mode SVG: one
	   seamless pattern tile (a hexagon outline plus a connector — never
	   per-cell DOM), stroked in neutral grays. The spotlight is a brighter
	   duplicate pattern revealed through an SVG mask whose gradient circle
	   follows the cursor via a CSS transform on constant geometry.

	   Cost design: nothing here animates. The hex variant adds NO keyframes
	   (so the reduced-motion block above needs no additions — hex's
	   reduced-motion behavior is the matchMedia gate in the script, which
	   attaches no listeners and renders no glow rect). The only transition is
	   a finite 250ms opacity fade on glow enter/leave, on compositor-only
	   `opacity`. All movement is event-driven from the script — zero scheduled
	   work at rest.

	   Neutral grays only: the RGB triad stays reserved for node identity. The
	   spotlight's warmth comes from stone-tinted strokes, not color. Custom
	   properties inherit through the DOM into <pattern> content, so these
	   variables retint both lattices per theme from one override point. */
	.hex-svg {
		position: absolute;
		inset: 0;
		--hex-line: #9ca3af; /* gray-400 on the gray-950 page */
		--hex-line-hot: #d6d3d1; /* stone-300: faint neutral-warm accent */
		--hex-base-opacity: 0.06;
		--hex-glow-opacity: 0.22;
	}

	.hex-base {
		opacity: var(--hex-base-opacity);
	}

	/* Finite transition (not an animation): runs once on pointer enter/leave,
	   then everything is static again. */
	.hex-glow {
		opacity: 0;
		transition: opacity 250ms ease-out;
	}

	.hex-glow-on {
		opacity: var(--hex-glow-opacity);
	}

	/* Light theme (`.light` lives on the page root, outside this component):
	   lines flip darker than the #e8eaef surface so the grid stays visible;
	   the glow stays warm-neutral. No page-bg duplication anywhere — the
	   translucent strokes composite over whatever the real page bg is. */
	:global(.light) .hex-svg {
		--hex-line: #4b5563; /* gray-600 */
		--hex-line-hot: #57534e; /* stone-600 */
		--hex-base-opacity: 0.08;
		--hex-glow-opacity: 0.18;
	}
</style>
