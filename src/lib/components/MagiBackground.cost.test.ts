import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Rendering-cost regression guard for the aurora background.
//
// The animated background once used `filter: blur(120px)` on three half-viewport
// elements that were `transform`-animated forever. A large-radius blur is
// re-rasterized every frame and isn't reliably GPU-accelerated on WebKit/macOS,
// so it pegged a CPU core for as long as the app stayed open — even fully idle.
//
// That cost lives entirely in CSS, where a runtime/jsdom test can't see it
// (jsdom doesn't compute styles from a Svelte <style> block, and the real cost
// is on the compositor, off the main thread). So we assert the invariant at the
// source level instead: the glow must come from gradients, never an animated
// blur, and reduced-motion must stay honored. These are deliberate, documented
// guards — if a future change reaches for `filter: blur()` here again, this fails
// loudly with the reason why.
const raw = readFileSync(new URL('./MagiBackground.svelte', import.meta.url), 'utf8');
// Strip block comments so the guards check real declarations, not the prose that
// documents them — the component comment deliberately names `filter: blur()` to
// explain why it's banned, and that mention must not trip the ban itself.
const source = raw.replace(/\/\*[\s\S]*?\*\//g, '');

describe('MagiBackground rendering cost', () => {
	it('never uses filter: blur() (re-rasters every frame; pegs CPU on WebKit)', () => {
		expect(source).not.toMatch(/filter\s*:\s*blur\s*\(/i);
	});

	it('paints the glow with gradients (a one-time paint, cheap to drift)', () => {
		expect(source).toMatch(/radial-gradient\(/);
		expect(source).toMatch(/linear-gradient\(/);
	});

	it('honors prefers-reduced-motion so the drift can be stopped entirely', () => {
		expect(source).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
		// The query must actually disable the animations, not just exist.
		const reducedMotionBlock = source.slice(source.indexOf('prefers-reduced-motion'));
		expect(reducedMotionBlock).toMatch(/animation\s*:\s*none/);
	});

	it('animates only transform (compositor-cheap), not layout/paint properties', () => {
		// Pull out every @keyframes body and confirm each step only touches
		// `transform` — animating width/height/filter/box-shadow would reintroduce
		// per-frame layout or paint work.
		const keyframeBodies = source.match(/@keyframes[^{]+\{([\s\S]*?)\n\t\}/g) ?? [];
		expect(keyframeBodies.length).toBeGreaterThan(0);
		for (const body of keyframeBodies) {
			const declaredProps = [...body.matchAll(/^\s*([a-z-]+)\s*:/gim)].map((m) => m[1]);
			for (const prop of declaredProps) {
				expect(prop).toBe('transform');
			}
		}
	});
});

// The hex variant adds pointer-driven JS to a file that previously had none.
// Its cost contract: all work is event-driven (no polling, no animation loop),
// commits coalesce to at most one per frame, and the spotlight moves via a
// CSS transform on constant geometry. Like the CSS guards above, these are
// deliberate, implementation-pinning assertions — refactors of the pointer
// pipeline must consciously update them.
describe('hex variant rendering cost', () => {
	it('tracks the pointer with a passive window listener and tears it down', () => {
		expect(source).toMatch(
			/window\.addEventListener\(\s*'pointermove'[\s\S]{0,120}\{\s*passive:\s*true\s*\}/
		);
		expect(source).toMatch(/removeEventListener\(\s*'pointermove'/);
	});

	it('coalesces to a single rAF that never re-arms itself (no animation loop)', () => {
		const calls = source.match(/requestAnimationFrame\(/g) ?? [];
		expect(calls).toHaveLength(1);
		// The callback must zero the handle and never schedule again — a
		// self-rescheduling callback would reintroduce per-frame idle work.
		const start = source.indexOf('requestAnimationFrame(');
		const callback = source.slice(start, start + 400);
		expect(callback).toMatch(/rafId\s*=\s*0/);
	});

	it('never polls — timers cannot drive a background repaint', () => {
		expect(source).not.toMatch(/setInterval\s*\(/);
		expect(source).not.toMatch(/setTimeout\s*\(/);
	});

	it('moves the spotlight via transform, never geometry-attribute churn', () => {
		expect(source).toMatch(/style:transform/);
		expect(source).not.toMatch(/setAttribute\(\s*'c[xy]'/);
		expect(source).not.toMatch(/\bc[xy]=\{/);
	});

	it('gates pointer reactivity behind hover and reduced-motion media queries', () => {
		expect(source).toMatch(/matchMedia\(\s*'\(hover: hover\) and \(pointer: fine\)'\s*\)/);
		expect(source).toMatch(/matchMedia\(\s*'\(prefers-reduced-motion: reduce\)'\s*\)/);
	});
});
