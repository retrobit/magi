import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import { createSlidingPill, type SlidingPill } from './sliding-pill.svelte';

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	vi.unstubAllGlobals();
});

function el(left: number, width: number) {
	const e = document.createElement('div');
	e.getBoundingClientRect = () => ({ left, width }) as DOMRect;
	return e;
}

function setup() {
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			disconnect() {}
		}
	);
	const container = el(10, 300);
	const buttons = { a: el(14, 50), b: el(70, 80) };
	const state = $state({ active: 'a' as 'a' | 'b' });
	let pill!: SlidingPill;
	cleanup = $effect.root(() => {
		pill = createSlidingPill({
			containerEl: () => container,
			activeEl: () => buttons[state.active]
		});
	});
	return { pill, state };
}

describe('createSlidingPill', () => {
	it('stays un-ready (no slide-in) until the first measure, then tracks the active button', async () => {
		const { pill, state } = setup();
		flushSync();
		expect(pill.ready).toBe(false);
		await Promise.resolve();
		await Promise.resolve();
		expect(pill.ready).toBe(true);
		// Offset is relative to the container; width is the button's own.
		expect(pill.x).toBe(4);
		expect(pill.width).toBe(50);

		state.active = 'b';
		flushSync();
		await Promise.resolve();
		await Promise.resolve();
		expect(pill.x).toBe(60);
		expect(pill.width).toBe(80);
	});
});
