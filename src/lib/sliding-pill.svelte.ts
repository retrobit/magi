import { tick } from 'svelte';

export interface SlidingPillOptions {
	/** Reactive getter for the segmented control's container (owns `bind:this`). */
	containerEl: () => HTMLElement | undefined;
	/** Reactive getter for the selected segment's button. Read inside the re-place
	 *  effect, so a change of selection re-measures. */
	activeEl: () => HTMLElement | undefined;
}

export interface SlidingPill {
	/** Pill offset from the container's left edge, in px — apply as `translateX`. */
	readonly x: number;
	/** Pill width in px (the active button's width). */
	readonly width: number;
	/** False until the first measure lands, so the pill appears in place on load
	 *  instead of sliding in from the left edge. Drives the `.animate` class. */
	readonly ready: boolean;
}

/**
 * Shared "sliding pill" for the tier selector and the layout toggle: one highlight
 * that glides under whichever segment is active, instead of each button toggling its
 * own background. Measures the active button against the container, re-places on a
 * selection change (after a `tick`, so a just-mounted button ref exists) and on any
 * container resize (a late web-font swap or reflow shifts a button, which would
 * otherwise strand the pill).
 *
 * The pill is positioned with `transform: translateX(x)` and sized with `width`;
 * only the transform transitions (`.magi-pill.animate`, layout.css), so the width
 * change is instant and the rounded corners are never distorted by a scale.
 *
 * Call from a component's top-level `<script>` so the `$effect`s register in its lifecycle.
 */
export function createSlidingPill(opts: SlidingPillOptions): SlidingPill {
	let x = $state(0);
	let width = $state(0);
	let ready = $state(false);

	function measure() {
		const btn = opts.activeEl();
		const container = opts.containerEl();
		if (!btn || !container) return;
		const r = btn.getBoundingClientRect();
		x = r.left - container.getBoundingClientRect().left;
		width = r.width;
	}

	$effect(() => {
		void opts.activeEl();
		tick().then(() => {
			measure();
			ready = true;
		});
	});

	$effect(() => {
		const container = opts.containerEl();
		if (!container) return;
		const ro = new ResizeObserver(() => measure());
		ro.observe(container);
		return () => ro.disconnect();
	});

	return {
		get x() {
			return x;
		},
		get width() {
			return width;
		},
		get ready() {
			return ready;
		}
	};
}
