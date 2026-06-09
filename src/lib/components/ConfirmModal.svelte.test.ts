import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import axe from 'axe-core';
import ConfirmModal from './ConfirmModal.svelte';

const JSDOM_INCOMPATIBLE = ['color-contrast', 'region', 'landmark-one-main'];

async function noAxeViolations(container: HTMLElement) {
	const results = await axe.run(container, {
		rules: Object.fromEntries(JSDOM_INCOMPATIBLE.map((id) => [id, { enabled: false }]))
	});
	return results.violations;
}

const baseProps = {
	title: 'Reset everything?',
	message: 'This cannot be undone.',
	confirmLabel: 'Reset',
	cancelLabel: 'Cancel'
};

describe('ConfirmModal', () => {
	it('renders the title, message, and both action labels', () => {
		render(ConfirmModal, { props: { ...baseProps, onconfirm: vi.fn(), oncancel: vi.fn() } });
		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(screen.getByText('Reset everything?')).toBeInTheDocument();
		expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
		const dialog = screen.getByRole('dialog');
		expect(within(dialog).getByRole('button', { name: 'Reset' })).toBeInTheDocument();
		expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('calls onconfirm when the confirm button is clicked', () => {
		const onconfirm = vi.fn();
		render(ConfirmModal, { props: { ...baseProps, onconfirm, oncancel: vi.fn() } });
		within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset' }).click();
		expect(onconfirm).toHaveBeenCalledOnce();
	});

	it('calls oncancel from the cancel button, the backdrop, and the Escape key', () => {
		const oncancel = vi.fn();
		render(ConfirmModal, { props: { ...baseProps, onconfirm: vi.fn(), oncancel } });

		const dialog = screen.getByRole('dialog');
		within(dialog).getByRole('button', { name: 'Cancel' }).click();
		expect(oncancel).toHaveBeenCalledTimes(1);

		// The backdrop is a separate button outside the dialog, also labeled Cancel.
		const backdrop = screen
			.getAllByRole('button', { name: 'Cancel' })
			.find((b) => !dialog.contains(b));
		expect(backdrop).toBeDefined();
		backdrop!.click();
		expect(oncancel).toHaveBeenCalledTimes(2);

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(oncancel).toHaveBeenCalledTimes(3);
	});

	it('does not cancel on unrelated keys', () => {
		const oncancel = vi.fn();
		render(ConfirmModal, { props: { ...baseProps, onconfirm: vi.fn(), oncancel } });
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(oncancel).not.toHaveBeenCalled();
	});

	it('has no axe a11y violations', async () => {
		const { container } = render(ConfirmModal, {
			props: { ...baseProps, onconfirm: vi.fn(), oncancel: vi.fn() }
		});
		expect(await noAxeViolations(container)).toEqual([]);
	});
});
