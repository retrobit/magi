import { tick } from 'svelte';
import type { MotionMode } from '$lib/magi/types';
import type { StrategyName } from '$lib/magi/consensus/types';

export type LayoutFocus = 'balanced' | 'nodes' | 'consensus';
export type LayoutChoice = 'auto' | LayoutFocus;

// Coarse run lifecycle, used to drive auto-layout. `thinking` = some MAGI is
// still generating (phase-1 answer or a debate round) and the consensus hasn't
// emitted yet; `synthesizing` = a MAGI is still working while the consensus
// streams alongside (the debate ledger); `reviewing` = every MAGI is done but
// the consensus is still streaming — hand it the full panel now rather than
// waiting for it to finish; `done` = the committed turn has a consensus; `idle`
// = nothing has run yet.
export type RunPhase = 'idle' | 'thinking' | 'synthesizing' | 'reviewing' | 'done';

const PHASE_FOCUS: Record<RunPhase, LayoutFocus | null> = {
	idle: null,
	thinking: 'nodes',
	synthesizing: 'balanced',
	reviewing: 'consensus',
	done: 'consensus'
};

// Each header's cycle leads with its own zone's max state.
export const NODE_LAYOUT_CYCLE = ['nodes', 'balanced', 'consensus'] as const;
export const CONSENSUS_LAYOUT_CYCLE = ['consensus', 'balanced', 'nodes'] as const;

export interface LayoutFocusOptions {
	/** Reactive getter for the coarse run lifecycle that drives auto-layout. */
	runPhase: () => RunPhase;
	/** Reactive getter for the active strategy ('none' never drifts toward the consensus). */
	strategy: () => StrategyName;
	/** Reactive getter for the motion preference ('reduced' skips the FLIP tween). */
	motionMode: () => MotionMode;
	/** Reactive getters for the two resizable zones (the page owns their `bind:this`). */
	nodeZone: () => HTMLElement | undefined;
	consensusZone: () => HTMLElement | undefined;
}

export interface LayoutFocusController {
	/** Current focus accordion state. Read-only — change it through the methods below. */
	readonly focus: LayoutFocus;
	/** Auto-layout on/off. The page writes it when restoring persisted settings. */
	auto: boolean;
	/** Move the focus (FLIP-tweened) and revoke the header-cycle claim. */
	set(focus: LayoutFocus): void;
	/** LayoutToggle dispatch: Auto re-arms and reasserts the phase, a segment pins its focus. */
	choose(choice: LayoutChoice): void;
	/** A panel header was clicked: continue or restart that header's cycle. */
	cycleFrom(order: typeof NODE_LAYOUT_CYCLE | typeof CONSENSUS_LAYOUT_CYCLE): void;
	/** New-conversation reset: back to balanced when auto-layout is on, otherwise a no-op. */
	reset(): void;
}

/**
 * Layout focus between the node row and the consensus: the accordion state, the
 * FLIP tween that animates it, auto-layout following the run lifecycle, and the
 * last-actor header cycle. Same getter style as `createFollowScroll`; call it from
 * a component's top-level `<script>` so its `$effect` registers in that lifecycle.
 *
 * The status-bar layout control sets one of three states: nodes expanded, consensus
 * expanded, or a balanced split (the default — both zones share the view so neither
 * buries the other before the user has decided where to focus).
 */
export function createLayoutFocus(opts: LayoutFocusOptions): LayoutFocusController {
	let focus = $state<LayoutFocus>('balanced');
	// Auto-layout: when on (the default), the focus accordion follows the run
	// lifecycle — nodes while they think, balanced while the consensus streams,
	// consensus once it lands. Picking any manual segment turns it off; the Auto
	// segment turns it back on and immediately reasserts the current phase.
	let auto = $state(true);

	// Header-click layout cycling with a last-actor rule: a header only CONTINUES
	// its cycle (max→shared→other→wrap) when that same header zone made the
	// previous layout change. After anything else moves the layout — the other
	// header, the LayoutToggle, auto-layout, the new-conversation reset — the
	// claim is revoked (set() clears it) and the next header click restarts by
	// expanding its own zone, regardless of the current focus. The one exception:
	// if the layout is already sitting on that zone's max, the restart would be a
	// dead click, so it advances instead.
	// Plain `let` (not $state) — handler-local bookkeeping, never rendered.
	let lastHeaderActor: 'nodes' | 'consensus' | null = null;

	// Layout focus changes via the LayoutToggle, the panel headers and auto-layout. The zones resize via
	// a flex/grid reflow that would otherwise snap, so we FLIP it: measure each
	// zone's height, apply the new layout, then animate old→new in explicit pixels.
	// A CSS transition can't do this cleanly — the flex-basis swap (fill ↔ header)
	// snaps mid-tween. WAAPI height reverts to the flex height on finish, so there's
	// no end-state jump. Skipped under reduced motion.
	function set(next: LayoutFocus) {
		// Any layout change revokes the header-cycle claim (see cycleFrom, which
		// re-stamps it immediately after calling this).
		lastHeaderActor = null;
		const reduced =
			opts.motionMode() === 'reduced' ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const zones = [opts.nodeZone(), opts.consensusZone()].filter((z): z is HTMLElement => !!z);
		if (reduced || zones.length === 0) {
			focus = next;
			return;
		}
		const before = zones.map((z) => z.getBoundingClientRect().height);
		focus = next;
		void tick().then(() => {
			// Pass 1: cancel any in-flight tween from a previous rapid change AND clear
			// its leftover inline flex/height, so the after-heights measured next are
			// the NEW layout's natural sizes — not a stale tween's target (which showed
			// as a dead click followed by a snap).
			for (const z of zones) {
				z.getAnimations().forEach((a) => a.cancel());
				z.style.flex = '';
				z.style.height = '';
			}
			// Pass 2: measure the settled after-heights.
			const after = zones.map((z) => z.getBoundingClientRect().height);
			// Pass 3: tween each zone that actually changed. A `flex-1` zone ignores an
			// animated `height` (flex-grow wins), so pin flex off + an explicit height
			// for the tween, then hand back to flex on finish (lands on the same height
			// the fill holds, so no end jump).
			zones.forEach((z, i) => {
				if (Math.abs(after[i] - before[i]) < 1) return;
				z.style.flex = 'none';
				z.style.height = `${before[i]}px`;
				const anim = z.animate([{ height: `${before[i]}px` }, { height: `${after[i]}px` }], {
					duration: 280,
					easing: 'ease',
					fill: 'forwards'
				});
				let cleaned = false;
				const restore = () => {
					if (cleaned) return;
					cleaned = true;
					anim.cancel();
					z.style.flex = '';
					z.style.height = '';
				};
				anim.onfinish = restore;
				anim.oncancel = restore;
			});
		});
	}

	// None strategy produces no consensus, so auto-layout must never drift toward
	// the (empty) consensus panel: keep the nodes expanded for every active phase
	// instead of collapsing them at reviewing/done. Idle stays a no-op (null).
	function autoFocusForPhase(phase: RunPhase): LayoutFocus | null {
		const base = PHASE_FOCUS[phase];
		if (opts.strategy() === 'none' && base !== null) return 'nodes';
		return base;
	}

	// Routed through set() (not a raw assignment) so the FLIP runs AND the auto/manual
	// split falls out for free: with auto on, the accordion keeps showing "Auto" and
	// the next phase reclaims the focus (a temporary nudge); with auto off, the manual
	// focus persists and the accordion reflects it.
	function cycleFrom(order: typeof NODE_LAYOUT_CYCLE | typeof CONSENSUS_LAYOUT_CYCLE) {
		const actor = order[0];
		const next =
			lastHeaderActor !== actor && focus !== actor
				? actor
				: order[(order.indexOf(focus) + 1) % order.length];
		set(next);
		lastHeaderActor = actor;
	}

	// Auto-layout: when on, move the focus accordion as the run progresses. Only
	// fires on a *phase change* (so a manual nudge between phases sticks until the
	// next transition), and stays disarmed until the first real `thinking` phase so
	// a restored conversation doesn't yank the layout on load. Plain `let` (not
	// $state) — these are effect-local bookkeeping, never rendered.
	let lastRunPhase: RunPhase | null = null;
	let autoArmed = false;
	$effect(() => {
		const phase = opts.runPhase();
		const prev = lastRunPhase;
		lastRunPhase = phase;
		if (phase === 'thinking') autoArmed = true;
		if (!auto || !autoArmed || phase === prev) return;
		const next = autoFocusForPhase(phase);
		if (next) set(next);
	});

	function choose(choice: LayoutChoice) {
		if (choice === 'auto') {
			auto = true;
			autoArmed = true;
			set(autoFocusForPhase(opts.runPhase()) ?? focus);
		} else {
			auto = false;
			set(choice);
		}
	}

	function reset() {
		if (auto) set('balanced');
	}

	return {
		get focus() {
			return focus;
		},
		get auto() {
			return auto;
		},
		set auto(v: boolean) {
			auto = v;
		},
		set,
		choose,
		cycleFrom,
		reset
	};
}
