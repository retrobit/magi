import { describe, it, expect, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import {
	createLayoutFocus,
	NODE_LAYOUT_CYCLE,
	CONSENSUS_LAYOUT_CYCLE,
	type LayoutFocusController,
	type RunPhase
} from './layout-focus.svelte';
import type { StrategyName } from '$lib/magi/consensus/types';

// Reduced motion skips the FLIP tween, so focus changes apply synchronously and
// the controller's state machine can be tested without layout.
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function setup(initial: { phase?: RunPhase; strategy?: StrategyName } = {}) {
	const inputs = $state({
		phase: initial.phase ?? ('idle' as RunPhase),
		strategy: initial.strategy ?? ('synthesis' as StrategyName)
	});
	let layout!: LayoutFocusController;
	cleanup = $effect.root(() => {
		layout = createLayoutFocus({
			runPhase: () => inputs.phase,
			strategy: () => inputs.strategy,
			motionMode: () => 'reduced',
			nodeZone: () => undefined,
			consensusZone: () => undefined
		});
	});
	flushSync();
	return {
		layout,
		phase(p: RunPhase) {
			inputs.phase = p;
			flushSync();
		}
	};
}

describe('createLayoutFocus', () => {
	it('starts balanced with auto-layout on', () => {
		const { layout } = setup();
		expect(layout.focus).toBe('balanced');
		expect(layout.auto).toBe(true);
	});

	describe('auto-layout', () => {
		it('stays disarmed until the first thinking phase (a restored conversation does not yank the layout)', () => {
			const { layout, phase } = setup({ phase: 'done' });
			expect(layout.focus).toBe('balanced');
			phase('idle');
			phase('done');
			expect(layout.focus).toBe('balanced');
		});

		it('follows the run lifecycle once armed', () => {
			const { layout, phase } = setup();
			phase('thinking');
			expect(layout.focus).toBe('nodes');
			phase('synthesizing');
			expect(layout.focus).toBe('balanced');
			phase('reviewing');
			expect(layout.focus).toBe('consensus');
			phase('done');
			expect(layout.focus).toBe('consensus');
		});

		it('keeps the nodes expanded for the None strategy, which has no consensus', () => {
			const { layout, phase } = setup({ strategy: 'none' });
			phase('thinking');
			phase('reviewing');
			expect(layout.focus).toBe('nodes');
			phase('done');
			expect(layout.focus).toBe('nodes');
		});

		it('is ignored while auto is off, and a manual nudge sticks between phases', () => {
			const { layout, phase } = setup();
			phase('thinking');
			layout.choose('consensus');
			expect(layout.auto).toBe(false);
			phase('synthesizing');
			expect(layout.focus).toBe('consensus');
		});
	});

	describe('choose', () => {
		it('pins a manual segment and turns auto off', () => {
			const { layout } = setup();
			layout.choose('nodes');
			expect(layout.focus).toBe('nodes');
			expect(layout.auto).toBe(false);
		});

		it('Auto re-arms and snaps to the current phase, or stays put when idle', () => {
			const { layout, phase } = setup();
			layout.choose('nodes');
			layout.choose('auto');
			expect(layout.auto).toBe(true);
			expect(layout.focus).toBe('nodes'); // idle: no phase focus, keeps the current one
			phase('reviewing');
			layout.choose('balanced');
			layout.choose('auto');
			expect(layout.focus).toBe('consensus');
		});
	});

	describe('cycleFrom (last-actor rule)', () => {
		it('restarts on its own zone, then continues max → shared → other → wrap', () => {
			const { layout } = setup();
			layout.cycleFrom(NODE_LAYOUT_CYCLE);
			expect(layout.focus).toBe('nodes');
			layout.cycleFrom(NODE_LAYOUT_CYCLE);
			expect(layout.focus).toBe('balanced');
			layout.cycleFrom(NODE_LAYOUT_CYCLE);
			expect(layout.focus).toBe('consensus');
			layout.cycleFrom(NODE_LAYOUT_CYCLE);
			expect(layout.focus).toBe('nodes');
		});

		it('restarts when the other header acted in between', () => {
			const { layout } = setup();
			layout.cycleFrom(NODE_LAYOUT_CYCLE); // nodes
			layout.cycleFrom(CONSENSUS_LAYOUT_CYCLE); // consensus header restarts: consensus
			expect(layout.focus).toBe('consensus');
			layout.cycleFrom(NODE_LAYOUT_CYCLE); // nodes header restarts: nodes
			expect(layout.focus).toBe('nodes');
		});

		it('restarts after an outside change (toggle, auto-layout, reset) revokes the claim', () => {
			const { layout } = setup();
			layout.cycleFrom(NODE_LAYOUT_CYCLE); // nodes
			layout.choose('balanced'); // outside change
			layout.cycleFrom(NODE_LAYOUT_CYCLE); // restart, not continue
			expect(layout.focus).toBe('nodes');
		});

		it('advances instead of a dead click when the layout already sits on the zone max', () => {
			const { layout } = setup();
			layout.choose('nodes');
			layout.cycleFrom(NODE_LAYOUT_CYCLE);
			expect(layout.focus).toBe('balanced');
		});
	});

	describe('reset', () => {
		it('returns to balanced when auto is on', () => {
			const { layout } = setup();
			layout.set('consensus');
			layout.reset();
			expect(layout.focus).toBe('balanced');
		});

		it('revokes nothing and moves nothing when auto is off', () => {
			const { layout } = setup();
			layout.cycleFrom(NODE_LAYOUT_CYCLE); // nodes, claim held
			layout.auto = false;
			layout.reset();
			expect(layout.focus).toBe('nodes');
			layout.cycleFrom(NODE_LAYOUT_CYCLE); // claim intact: continues
			expect(layout.focus).toBe('balanced');
		});
	});
});
