<script lang="ts">
	// Animated ASCII intro. Three selectable concepts, all monospace, all built
	// from compositor-cheap opacity/transform (plus SVG stroke draw-on for the
	// convergence beams). Auto-finishes after the concept's timeline; click or any
	// key skips; reduced-motion jumps to the final frame and holds briefly. The
	// parent owns visibility — mount it behind an {#if} and it self-dismisses via
	// `ondone` (after a short fade) when the run completes or is skipped.
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		concept: 'boot' | 'decode' | 'convergence';
		reduceMotion?: boolean;
		ondone: () => void;
	}
	let { concept, reduceMotion = false, ondone }: Props = $props();

	let stageEl = $state<HTMLDivElement | null>(null);

	const reduced = $derived(
		reduceMotion ||
			(typeof window !== 'undefined' &&
				window.matchMedia('(prefers-reduced-motion: reduce)').matches)
	);

	let fading = $state(false);
	let finished = false;
	const timers: ReturnType<typeof setTimeout>[] = [];
	const intervals: ReturnType<typeof setInterval>[] = [];
	const after = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

	// Modifier keys (Tab, Shift, etc.) and held-down keys must not skip the
	// animation — the user may just be navigating or exploring with a screen reader.
	const SKIP_IGNORE = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta']);

	function guardedFinish(e: KeyboardEvent) {
		if (e.repeat || SKIP_IGNORE.has(e.key)) return;
		finish();
	}

	function finish() {
		if (finished) return;
		finished = true;
		timers.forEach(clearTimeout);
		intervals.forEach(clearInterval);
		fading = true;
		// Match the .splash opacity transition before unmounting.
		setTimeout(ondone, 420);
	}

	// ── boot ──────────────────────────────────────────────────────────────
	let bootStep = $state(0);
	function runBoot() {
		const step = 230;
		for (let s = 1; s <= 6; s += 1) after(s * step, () => (bootStep = s));
		// Hold on the fully-assembled panel long enough to read every line before
		// dissolving (the lines only finish landing at 6×step).
		after(6 * step + 1700, finish);
	}

	// ── decode ────────────────────────────────────────────────────────────
	const DECODE_TARGET = 'M A G I';
	const GLYPHS = '▲▼█#@%&0123456789ABCDEF░▒▓<>/\\=+*';
	const rnd = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
	let decoded = $state<string[]>(DECODE_TARGET.split('').map((c) => (c === ' ' ? ' ' : '')));
	let triadOn = $state(false);
	function runDecode() {
		const slots = DECODE_TARGET.split('')
			.map((c, i) => ({ c, i }))
			.filter((p) => p.c !== ' ');
		let locked = 0;
		const tick = setInterval(() => {
			decoded = DECODE_TARGET.split('').map((c, i) => {
				if (c === ' ') return ' ';
				const order = slots.findIndex((s) => s.i === i);
				return order < locked ? c : rnd();
			});
		}, 45);
		intervals.push(tick);
		const lockMs = 150;
		slots.forEach((_, k) => after(450 + k * lockMs, () => (locked = k + 1)));
		const settled = 450 + slots.length * lockMs;
		after(settled, () => {
			clearInterval(tick);
			decoded = DECODE_TARGET.split('');
			triadOn = true;
		});
		// Linger on the resolved wordmark + triad long enough for the triangles'
		// glow pulse to complete a full cycle before dissolving — the last triangle
		// starts its pulse 820ms after the triad lands and one cycle runs 1.9s.
		after(settled + 2800, finish);
	}

	// ── convergence ───────────────────────────────────────────────────────
	let convStep = $state(0);
	function runConvergence() {
		after(60, () => (convStep = 1)); // labels slide in
		after(680, () => (convStep = 2)); // beams draw to center
		after(1320, () => (convStep = 3)); // the ▲▼▲ mark assembles + pulses
		after(1820, () => (convStep = 4)); // caption
		// Hold on the assembled mark + caption (parity with the boot hold).
		after(3400, finish);
	}

	onMount(() => {
		// Focus the stage so screen readers announce the label and Enter/Space work
		// naturally without requiring the user to tab to it first.
		stageEl?.focus();

		if (reduced) {
			bootStep = 6;
			decoded = DECODE_TARGET.split('');
			triadOn = true;
			convStep = 4;
			after(850, finish);
			return;
		}
		if (concept === 'boot') runBoot();
		else if (concept === 'decode') runDecode();
		else runConvergence();
	});

	onDestroy(() => {
		timers.forEach(clearTimeout);
		intervals.forEach(clearInterval);
	});
</script>

<svelte:window onkeydown={guardedFinish} />

<!-- The whole stage is the skip target. -->
<div
	bind:this={stageEl}
	class="splash"
	class:fading
	class:reduced
	role="button"
	tabindex="0"
	aria-label="MAGI intro animation — press any key or click to skip"
	onclick={finish}
	onkeydown={guardedFinish}
>
	{#if concept === 'boot'}
		<div class="boot">
			<div class="title">
				MAGI <span class="tri r">▲</span><span class="tri g">▼</span><span class="tri b">▲</span>
			</div>
			<div class="sub" class:show={bootStep >= 1}>booting deliberation core…</div>
			<div class="box" class:show={bootStep >= 2}>
				<div class="row" class:show={bootStep >= 3}>
					<span class="dot r"></span><span class="nm">MAGI 1</span><span class="st">online</span>
				</div>
				<div class="row" class:show={bootStep >= 4}>
					<span class="dot g"></span><span class="nm">MAGI 2</span><span class="st">online</span>
				</div>
				<div class="row" class:show={bootStep >= 5}>
					<span class="dot b"></span><span class="nm">MAGI 3</span><span class="st">online</span>
				</div>
			</div>
			<div class="tagline" class:show={bootStep >= 6}>three minds · one consensus</div>
		</div>
	{:else if concept === 'decode'}
		<div class="decode">
			<!-- Each glyph sits in a fixed-width slot so the scramble can't shift the
			     word horizontally as differently-sized characters cycle through. -->
			<div class="word">
				{#each decoded as ch, i (i)}<span class="ch">{ch}</span>{/each}
			</div>
			<div class="triad" class:show={triadOn}>
				<span class="tri r">▲</span><span class="tri g">▼</span><span class="tri b">▲</span>
			</div>
		</div>
	{:else}
		<div class="conv" data-step={convStep}>
			<svg
				class="beams"
				viewBox="0 0 400 260"
				preserveAspectRatio="xMidYMid meet"
				aria-hidden="true"
			>
				<line class="beam r" x1="72" y1="56" x2="200" y2="140" />
				<line class="beam b" x1="328" y1="56" x2="200" y2="140" />
				<line class="beam g" x1="200" y1="206" x2="200" y2="140" />
			</svg>
			<span class="lbl n1 r">MAGI 1</span>
			<span class="lbl n3 b">MAGI 3</span>
			<span class="lbl n2 g">MAGI 2</span>
			<div class="mark">
				<span class="tri r">▲</span><span class="tri g">▼</span><span class="tri b">▲</span>
			</div>
			<div class="cap">consensus formed</div>
		</div>
	{/if}

	<p class="hint">click to skip</p>
</div>

<style>
	.splash {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: var(--magi-page-bg);
		color: var(--magi-text);
		font-family: var(--magi-font-display);
		cursor: pointer;
		opacity: 1;
		transition: opacity 400ms ease;
	}
	.splash.fading {
		opacity: 0;
	}

	/* Node identity triad — the three triangles always wear their node colors. */
	.r {
		color: var(--magi-node-red);
		--c: var(--magi-node-red);
	}
	.g {
		color: var(--magi-node-green);
		--c: var(--magi-node-green);
	}
	.b {
		color: var(--magi-node-blue);
		--c: var(--magi-node-blue);
	}

	.tri {
		display: inline-block;
	}

	.hint {
		position: absolute;
		bottom: 1.5rem;
		font-size: 0.6875rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--magi-text-faint);
		opacity: 0.6;
	}

	/* ── boot ── */
	.boot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.9rem;
	}
	.boot .title {
		font-size: clamp(1.75rem, 6vw, 2.75rem);
		font-weight: 700;
		letter-spacing: 0.35em;
		padding-left: 0.35em;
	}
	.boot .title .tri {
		font-size: 0.7em;
		animation: flicker 2s ease-in-out infinite;
	}
	.boot .sub {
		font-size: 0.875rem;
		color: var(--magi-text-muted);
		opacity: 0;
		transform: translateY(4px);
		transition:
			opacity 280ms ease,
			transform 280ms ease;
	}
	.boot .box {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.85rem 1.25rem;
		border: 1px solid var(--magi-border);
		border-radius: 6px;
		min-width: min(86vw, 22rem);
		opacity: 0;
		transform: translateY(6px) scale(0.98);
		transition:
			opacity 320ms ease,
			transform 320ms ease;
	}
	.boot .row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.9rem;
		opacity: 0;
		transform: translateX(-6px);
		transition:
			opacity 260ms ease,
			transform 260ms ease;
	}
	.boot .row .nm {
		flex: 1;
		letter-spacing: 0.06em;
	}
	.boot .row .st {
		font-size: 0.75rem;
		color: var(--magi-text-faint);
	}
	.boot .row .dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--c);
		opacity: 0.2;
		transition:
			opacity 220ms ease,
			box-shadow 220ms ease;
	}
	.boot .row.show .dot {
		opacity: 1;
		box-shadow: 0 0 9px -1px var(--c);
	}
	.boot .tagline {
		font-size: 0.8rem;
		letter-spacing: 0.18em;
		color: var(--magi-text-muted);
		text-transform: lowercase;
		opacity: 0;
		transition: opacity 360ms ease;
	}
	.boot .show {
		opacity: 1 !important;
		transform: none !important;
	}

	/* ── decode ── */
	.decode {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}
	.decode .word {
		/* Monospace so every scramble glyph shares one cell width — the root of the
		   horizontal jitter was the proportional display font. */
		font-family: var(--font-mono, ui-monospace, 'Courier New', monospace);
		font-size: clamp(2rem, 8vw, 3.5rem);
		font-weight: 700;
		letter-spacing: 0.12em;
		min-height: 1.2em;
	}
	/* Fixed-width slot per glyph: even a non-mono fallback glyph (▲▼█░▒▓) is centred
	   in one cell and can't push its neighbours, so the word never shifts. */
	.decode .word .ch {
		display: inline-block;
		width: 1ch;
		text-align: center;
	}
	.decode .triad {
		font-size: clamp(1.1rem, 3vw, 1.6rem);
		letter-spacing: 0.5em;
		padding-left: 0.5em;
	}
	/* Each triangle fades in (staggered left→right), then holds full opacity and
	   breathes a coloured glow on/off. The glow's per-triangle offset makes it
	   travel across the three as a wave. No opacity dip and no scaling during the
	   pulse — only the drop-shadow glow animates. `forwards` holds the fade-in end
	   frame so the delayed glow picks up from full opacity. */
	.decode .triad .tri {
		opacity: 0;
	}
	.decode .triad.show .tri {
		animation:
			tri-in 420ms ease forwards,
			tri-glow 1.9s ease-in-out infinite;
	}
	.decode .triad.show .tri:nth-child(1) {
		animation-delay: 0ms, 480ms;
	}
	.decode .triad.show .tri:nth-child(2) {
		animation-delay: 170ms, 650ms;
	}
	.decode .triad.show .tri:nth-child(3) {
		animation-delay: 340ms, 820ms;
	}
	@keyframes tri-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes tri-glow {
		0%,
		100% {
			filter: drop-shadow(0 0 0 transparent);
		}
		50% {
			filter: drop-shadow(0 0 10px var(--c));
		}
	}
	/* Reduced motion: no entrance, no glow — the triad just sits at full opacity. */
	@media (prefers-reduced-motion: reduce) {
		.decode .triad .tri,
		.decode .triad.show .tri {
			animation: none;
			opacity: 1;
			filter: none;
		}
	}
	:global(.reduce-motion) .decode .triad .tri,
	:global(.reduce-motion) .decode .triad.show .tri {
		animation: none;
		opacity: 1;
		filter: none;
	}

	/* ── convergence ── */
	.conv {
		position: relative;
		width: min(92vw, 30rem);
		aspect-ratio: 400 / 260;
	}
	.conv .beams {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.conv .beam {
		stroke: var(--c);
		stroke-width: 2;
		stroke-linecap: round;
		opacity: 0.85;
		stroke-dasharray: 320;
		stroke-dashoffset: 320;
		transition: stroke-dashoffset 620ms ease;
	}
	.conv[data-step='2'] .beam,
	.conv[data-step='3'] .beam,
	.conv[data-step='4'] .beam {
		stroke-dashoffset: 0;
	}
	.conv .lbl {
		position: absolute;
		font-size: clamp(0.7rem, 2.4vw, 0.95rem);
		font-weight: 600;
		letter-spacing: 0.08em;
		opacity: 0;
		transition:
			opacity 400ms ease,
			transform 400ms ease;
	}
	.conv .n1 {
		top: 6%;
		left: 2%;
		transform: translate(-12px, -8px);
	}
	.conv .n3 {
		top: 6%;
		right: 2%;
		transform: translate(12px, -8px);
	}
	.conv .n2 {
		bottom: 0%;
		left: 50%;
		transform: translate(-50%, 10px);
	}
	.conv[data-step='1'] .lbl,
	.conv[data-step='2'] .lbl,
	.conv[data-step='3'] .lbl,
	.conv[data-step='4'] .lbl {
		opacity: 1;
	}
	.conv[data-step='1'] .n1,
	.conv[data-step='2'] .n1,
	.conv[data-step='3'] .n1,
	.conv[data-step='4'] .n1 {
		transform: none;
	}
	.conv[data-step='1'] .n3,
	.conv[data-step='2'] .n3,
	.conv[data-step='3'] .n3,
	.conv[data-step='4'] .n3 {
		transform: none;
	}
	.conv[data-step='1'] .n2,
	.conv[data-step='2'] .n2,
	.conv[data-step='3'] .n2,
	.conv[data-step='4'] .n2 {
		transform: translate(-50%, 0);
	}
	.conv .mark {
		position: absolute;
		top: 54%;
		left: 50%;
		transform: translate(-50%, -50%) scale(0.4);
		font-size: clamp(2.2rem, 6vw, 3.2rem);
		letter-spacing: 0.3em;
		padding-left: 0.3em;
		opacity: 0;
		transition:
			opacity 360ms ease,
			transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.conv[data-step='3'] .mark,
	.conv[data-step='4'] .mark {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1);
	}
	.conv[data-step='3'] .mark .tri,
	.conv[data-step='4'] .mark .tri {
		animation: flicker 1.6s ease-in-out infinite;
	}
	.conv .cap {
		position: absolute;
		bottom: -2.2rem;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.8rem;
		letter-spacing: 0.2em;
		text-transform: lowercase;
		color: var(--magi-text-muted);
		white-space: nowrap;
		opacity: 0;
		transition: opacity 360ms ease;
	}
	.conv[data-step='4'] .cap {
		opacity: 1;
	}

	@keyframes flicker {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.55;
		}
	}

	/* Reduced motion: everything is jumped to its final frame on mount; kill all
	   transitions/animations so nothing eases or pulses — it just appears. */
	.splash.reduced :global(*) {
		transition: none !important;
		animation: none !important;
	}
</style>
