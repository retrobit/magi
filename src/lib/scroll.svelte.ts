import type { ScrollMode } from '$lib/magi/types';

export interface FollowScrollOptions {
	/** Reactive getter for the current scroll mode. */
	scrollMode: () => ScrollMode;
	/** Reactive getter for the scroll viewport element (owns `bind:this` in the panel). */
	scrollEl: () => HTMLElement | undefined;
	/** Reactive getter for the content wrapper element — the ResizeObserver target. */
	contentEl: () => HTMLElement | undefined;
	/** Reactive getter for the viewport's own height; re-pins when the zone grows. */
	viewportH: () => number;
	/** Reactive getter for the committed-turn count; re-pins when a turn commits. */
	committedCount: () => number;
}

export interface FollowScroll {
	/** Whether the viewport is glued to the bottom. Written by the panel's per-mode
	 *  effects (e.g. re-engaging follow on a new live turn); read by its text-change nudge. */
	pinned: boolean;
	/** `onscroll` handler — recomputes `pinned` from the viewport's distance to the bottom. */
	onScroll(): void;
}

/**
 * Shared follow-to-bottom scroll machinery for the node and consensus transcripts —
 * the slice both panels ran byte-identically. Owns `pinned` tracking plus three effects:
 *
 *   1. a content ResizeObserver that glues to the bottom while pinned + following
 *      (watching the wrapper's size, not the `text` prop, waits for Markdown's
 *      throttled render to grow the DOM before chasing the bottom);
 *   2. a re-pin when the VIEWPORT's own height grows — e.g. the layout accordion
 *      expanding the zone — which the content observer can't see; and
 *   3. a re-pin when a turn COMMITS: the live block tears down and the finished turn
 *      re-mounts as a transcript entry Markdown renders at once, settling at the same
 *      net height it streamed at, so the observer never fires and an earlier shorter
 *      re-pin would otherwise stick as the final position (the "pop toward the top").
 *      This is the bug that was fixed twice before this was one place.
 *
 * Snap-mode targeting and the consensus text-change nudge differ per panel and stay
 * in the components, reaching `pinned` through the returned accessor.
 *
 * Call from a component's top-level `<script>` so the `$effect`s register in its
 * lifecycle; the panel keeps its own `bind:this` / `bind:clientHeight` on the elements.
 */
export function createFollowScroll(opts: FollowScrollOptions): FollowScroll {
	let pinned = $state(true);

	function onScroll() {
		const el = opts.scrollEl();
		if (!el) return;
		pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
	}

	// 1. Follow the growing content while pinned.
	$effect(() => {
		const el = opts.scrollEl();
		const content = opts.contentEl();
		if (!el || !content) return;
		const observer = new ResizeObserver(() => {
			if (opts.scrollMode() === 'follow' && pinned) el.scrollTop = el.scrollHeight;
		});
		observer.observe(content);
		return () => observer.disconnect();
	});

	// 2. Re-pin on viewport-only height growth (the content observer can't see it).
	$effect(() => {
		void opts.viewportH();
		const el = opts.scrollEl();
		if (opts.scrollMode() === 'follow' && pinned && el) el.scrollTop = el.scrollHeight;
	});

	// 3. Re-pin when a turn commits. Chase across a couple of frames plus one past
	//    Markdown's ~100 ms throttle. The `-1` sentinel seeds the watermark on the
	//    first run so a restored conversation never yanks the view on mount.
	let prevCount = -1;
	$effect(() => {
		const len = opts.committedCount();
		const prev = prevCount;
		prevCount = len;
		if (prev < 0 || len <= prev || opts.scrollMode() !== 'follow') return;
		const el = opts.scrollEl();
		if (!el) return;
		pinned = true;
		const toBottom = () => {
			if (opts.scrollMode() === 'follow' && pinned) el.scrollTop = el.scrollHeight;
		};
		requestAnimationFrame(() => requestAnimationFrame(toBottom));
		const t = setTimeout(toBottom, 140);
		return () => clearTimeout(t);
	});

	return {
		get pinned() {
			return pinned;
		},
		set pinned(v: boolean) {
			pinned = v;
		},
		onScroll
	};
}
