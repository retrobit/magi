<script lang="ts">
	// Animated ASCII intro: the MAGI wordmark decodes out of noise, then the node
	// triad lands. Auto-finishes after its timeline; click or any key skips;
	// reduced-motion jumps to the final frame and holds briefly. The
	// parent owns visibility — mount it behind an {#if} and it self-dismisses via
	// `ondone` (after a short fade) when the run completes or is skipped.
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		reduceMotion?: boolean;
		/** Show the amber demo badge — set on the public demo. */
		demo?: boolean;
		ondone: () => void;
	}
	let { reduceMotion = false, demo = false, ondone }: Props = $props();

	let stageEl = $state<HTMLDivElement | null>(null);

	const reduced = $derived(
		reduceMotion ||
			(typeof window !== 'undefined' &&
				window.matchMedia('(prefers-reduced-motion: reduce)').matches)
	);

	// Coarse pointer (touch) → the skip affordance is a tap, not a click. Pointer
	// type is stable for the session, so a one-shot read is enough.
	const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

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

	onMount(() => {
		// Focus the stage so screen readers announce the label and Enter/Space work
		// naturally without requiring the user to tab to it first.
		stageEl?.focus();

		if (reduced) {
			decoded = DECODE_TARGET.split('');
			triadOn = true;
			after(850, finish);
			return;
		}
		runDecode();
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
	aria-label="MAGI intro animation — press any key or {coarse ? 'touch' : 'click'} to skip"
	onclick={finish}
	onkeydown={guardedFinish}
>
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

	{#if demo}
		<p class="demo-badge">Demo</p>
	{/if}
	<p class="hint">{coarse ? 'touch to skip' : 'click to skip'}</p>
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
		color: var(--magi-text-muted);
		opacity: 0.8;
	}

	/* Amber demo badge — only on the public demo (gated by the `demo` prop). */
	.demo-badge {
		position: absolute;
		bottom: 3.4rem;
		margin: 0;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: #f59e0b;
		background: color-mix(in oklab, #f59e0b 14%, transparent);
		border: 1px solid color-mix(in oklab, #f59e0b 45%, transparent);
		border-radius: 4px;
		padding: 0.15rem 0.55rem;
	}

	.decode {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}
	.decode .word {
		/* Michroma — the same display face as the rest of the splash and the headers,
		   so every MAGI mark reads as one system. The decode word can use a
		   proportional face because the fixed 1ch slots below (not the font) are what
		   stop the scramble from shifting its glyphs horizontally. */
		font-family: var(--magi-font-display);
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
		/* One pulse, then hold the faint always-on halo (forwards) — the finish
		   timer was truncating a second, infinite cycle mid-bloom. The linger in
		   runDecode() is timed so the last triangle's single pulse completes first. */
		animation:
			tri-in 420ms ease forwards,
			tri-glow 1.9s ease-in-out 1 forwards;
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
			/* Never fully dark — a faint always-on halo keeps the triad lit. */
			filter: drop-shadow(0 0 3px var(--c));
		}
		50% {
			/* Layered shadows read as a brighter, fuller bloom than a single one. */
			filter: drop-shadow(0 0 16px var(--c)) drop-shadow(0 0 7px var(--c));
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

	/* Reduced motion: everything is jumped to its final frame on mount; kill all
	   transitions/animations so nothing eases or pulses — it just appears. */
	.splash.reduced :global(*) {
		transition: none !important;
		animation: none !important;
	}
</style>
