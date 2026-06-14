import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import axe from 'axe-core';
import LayoutToggle from './LayoutToggle.svelte';

// Rules that can't be evaluated in jsdom (they need real layout/contrast); the
// axe pass is a structural a11y check (roles, names, attributes), not a visual
// regression test.
const JSDOM_INCOMPATIBLE = ['color-contrast', 'region', 'landmark-one-main'];

async function noAxeViolations(container: HTMLElement) {
	const results = await axe.run(container, {
		rules: Object.fromEntries(JSDOM_INCOMPATIBLE.map((id) => [id, { enabled: false }]))
	});
	return results.violations;
}

describe('LayoutToggle', () => {
	it('renders one button per segment (auto + three focuses) with the right aria-pressed', () => {
		render(LayoutToggle, { props: { focus: 'balanced', auto: false, onchange: vi.fn() } });
		const buttons = screen.getAllByRole('button');
		expect(buttons).toHaveLength(4);
		// With auto off, the focus segment (balanced) is the pressed one.
		expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
		expect(screen.getByRole('button', { pressed: true })).toHaveAttribute(
			'aria-label',
			expect.stringMatching(/Balanced/)
		);
	});

	it('highlights the Auto segment when auto is on, not the live focus', () => {
		render(LayoutToggle, { props: { focus: 'consensus', auto: true, onchange: vi.fn() } });
		expect(screen.getByRole('button', { pressed: true })).toHaveAttribute(
			'aria-label',
			expect.stringMatching(/Auto layout/)
		);
	});

	it('invokes onchange with the segment value on click', async () => {
		const onchange = vi.fn();
		render(LayoutToggle, { props: { focus: 'balanced', auto: false, onchange } });
		screen.getByRole('button', { name: /MAGI node panels/i }).click();
		expect(onchange).toHaveBeenCalledWith('nodes');
	});

	it('invokes onchange with "auto" when the Auto segment is clicked', async () => {
		const onchange = vi.fn();
		render(LayoutToggle, { props: { focus: 'balanced', auto: false, onchange } });
		screen.getByRole('button', { name: /Auto layout/i }).click();
		expect(onchange).toHaveBeenCalledWith('auto');
	});

	it('has no axe a11y violations in any of its states', async () => {
		for (const [focus, auto] of [
			['consensus', false],
			['balanced', false],
			['nodes', false],
			['balanced', true]
		] as const) {
			const { container, unmount } = render(LayoutToggle, {
				props: { focus, auto, onchange: vi.fn() }
			});
			const violations = await noAxeViolations(container);
			expect(violations, `axe violations for focus=${focus} auto=${auto}`).toEqual([]);
			unmount();
		}
	});
});
