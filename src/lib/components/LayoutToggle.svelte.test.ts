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
	it('renders one button per layout state with the right aria-pressed', () => {
		render(LayoutToggle, { props: { focus: 'balanced', onchange: vi.fn() } });
		const buttons = screen.getAllByRole('button');
		expect(buttons).toHaveLength(3);
		// The middle button (balanced) is the pressed one; the other two are not.
		expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
		expect(screen.getByRole('button', { pressed: true })).toHaveAttribute(
			'aria-label',
			expect.stringMatching(/Balanced/)
		);
	});

	it('invokes onchange with the segment value on click', async () => {
		const onchange = vi.fn();
		render(LayoutToggle, { props: { focus: 'balanced', onchange } });
		screen.getByRole('button', { name: /MAGI node panels/i }).click();
		expect(onchange).toHaveBeenCalledWith('nodes');
	});

	it('has no axe a11y violations in any of its three states', async () => {
		for (const focus of ['consensus', 'balanced', 'nodes'] as const) {
			const { container, unmount } = render(LayoutToggle, { props: { focus, onchange: vi.fn() } });
			const violations = await noAxeViolations(container);
			expect(violations, `axe violations for focus=${focus}`).toEqual([]);
			unmount();
		}
	});
});
