import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import Splash from './Splash.svelte';

// jsdom lacks window.matchMedia — stub it before any component renders.
// The stub returns a non-matching media query by default (full motion).
function stubMatchMedia(matches = false) {
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn()
		}))
	});
}

describe('Splash', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		stubMatchMedia(false); // full-motion by default
	});

	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
	});

	// ── full-timeline auto-finish ─────────────────────────────────────────────

	it('boot: calls ondone exactly once after its full timeline elapses', async () => {
		const ondone = vi.fn();
		render(Splash, { props: { concept: 'boot', ondone } });
		// boot: 6×230ms steps + 1700ms hold = 3080ms, then +420ms fade = 3500ms total
		vi.advanceTimersByTime(10_000);
		expect(ondone).toHaveBeenCalledOnce();
	});

	it('decode: calls ondone exactly once after its full timeline elapses', async () => {
		const ondone = vi.fn();
		render(Splash, { props: { concept: 'decode', ondone } });
		// decode: settled = 450 + 4×150 = 1050ms, then +1900ms hold = 2950ms, +420ms fade
		vi.advanceTimersByTime(10_000);
		expect(ondone).toHaveBeenCalledOnce();
	});

	it('convergence: calls ondone exactly once after its full timeline elapses', async () => {
		const ondone = vi.fn();
		render(Splash, { props: { concept: 'convergence', ondone } });
		// convergence: last step at 3400ms, then +420ms fade = 3820ms total
		vi.advanceTimersByTime(10_000);
		expect(ondone).toHaveBeenCalledOnce();
	});

	// ── keyboard skip ─────────────────────────────────────────────────────────

	it('a non-modifier keydown (Enter) skips early and calls ondone after the fade', async () => {
		const ondone = vi.fn();
		render(Splash, { props: { concept: 'boot', ondone } });

		// Fire before the animation completes naturally.
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

		// ondone isn't called immediately — there's a 420ms fade first.
		expect(ondone).not.toHaveBeenCalled();

		vi.advanceTimersByTime(420);
		expect(ondone).toHaveBeenCalledOnce();
	});

	it('Tab keydown does NOT skip the animation', async () => {
		const ondone = vi.fn();
		render(Splash, { props: { concept: 'boot', ondone } });

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		vi.advanceTimersByTime(500); // well before any natural finish

		expect(ondone).not.toHaveBeenCalled();
	});

	it('Shift keydown does NOT skip the animation', async () => {
		const ondone = vi.fn();
		render(Splash, { props: { concept: 'decode', ondone } });

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
		vi.advanceTimersByTime(500);

		expect(ondone).not.toHaveBeenCalled();
	});

	it('a repeated keydown (autorepeat) does NOT skip the animation', async () => {
		const ondone = vi.fn();
		render(Splash, { props: { concept: 'boot', ondone } });

		window.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true })
		);
		vi.advanceTimersByTime(500);

		expect(ondone).not.toHaveBeenCalled();
	});

	// ── reduced-motion short path ─────────────────────────────────────────────

	it('reduceMotion=true finishes on the short path (~850ms + 420ms fade)', async () => {
		const ondone = vi.fn();
		render(Splash, { props: { concept: 'boot', reduceMotion: true, ondone } });

		// Nothing yet — the 850ms hold hasn't elapsed.
		vi.advanceTimersByTime(849);
		expect(ondone).not.toHaveBeenCalled();

		// 850ms hold fires finish(), then 420ms fade fires ondone.
		vi.advanceTimersByTime(1); // → 850ms
		expect(ondone).not.toHaveBeenCalled(); // fade hasn't elapsed yet

		vi.advanceTimersByTime(420); // → 1270ms total
		expect(ondone).toHaveBeenCalledOnce();
	});

	it('reduceMotion via matchMedia stub also takes the short path', async () => {
		// Re-stub matchMedia to report prefers-reduced-motion: reduce.
		stubMatchMedia(true);
		const ondone = vi.fn();
		render(Splash, { props: { concept: 'convergence', ondone } });

		vi.advanceTimersByTime(850 + 420);
		expect(ondone).toHaveBeenCalledOnce();
	});

	// ── guard: ondone never fires more than once ───────────────────────────────

	it('ondone is called at most once even if key + natural finish both fire', async () => {
		const ondone = vi.fn();
		render(Splash, { props: { concept: 'boot', ondone } });

		// Skip early…
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
		// …then let the full natural timeline run out too.
		vi.advanceTimersByTime(10_000);

		expect(ondone).toHaveBeenCalledOnce();
	});
});
