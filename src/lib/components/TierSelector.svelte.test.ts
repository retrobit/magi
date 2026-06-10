import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TierSelector from './TierSelector.svelte';

describe('TierSelector', () => {
	it('renders a button for every tier', () => {
		render(TierSelector, { props: { value: 'balanced', onchange: () => {} } });
		for (const label of ['Free', 'Budget', 'Balanced', 'Frontier']) {
			expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
		}
	});

	it('marks the active tier (white text; inactive stays muted)', () => {
		render(TierSelector, { props: { value: 'free', onchange: () => {} } });
		expect(screen.getByRole('button', { name: 'Free' })).toHaveClass('text-white');
		expect(screen.getByRole('button', { name: 'Frontier' })).not.toHaveClass('text-white');
	});

	it('calls onchange with the chosen tier when a button is clicked', async () => {
		const onchange = vi.fn();
		render(TierSelector, { props: { value: 'balanced', onchange } });
		await fireEvent.click(screen.getByRole('button', { name: 'Frontier' }));
		expect(onchange).toHaveBeenCalledWith('frontier');
	});

	it('disables every tier button when disabled is set', () => {
		render(TierSelector, { props: { value: 'balanced', onchange: () => {}, disabled: true } });
		for (const button of screen.getAllByRole('button')) {
			expect(button).toBeDisabled();
		}
	});

	it('moves the active marker when the value prop changes', async () => {
		const { rerender } = render(TierSelector, { props: { value: 'budget', onchange: () => {} } });
		expect(screen.getByRole('button', { name: 'Budget' })).toHaveClass('text-white');
		await rerender({ value: 'frontier', onchange: () => {} });
		expect(screen.getByRole('button', { name: 'Budget' })).not.toHaveClass('text-white');
		expect(screen.getByRole('button', { name: 'Frontier' })).toHaveClass('text-white');
	});
});
