import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TemperamentEditor from './TemperamentEditor.svelte';
import { defaultNodeTemperament } from '$lib/magi/temperaments';

const labels = {
	MELCHIOR: 'MAGI • 1',
	BALTHASAR: 'MAGI • 2',
	CASPAR: 'MAGI • 3'
};

function renderEditor(value = {}) {
	const onsave = vi.fn();
	const onclose = vi.fn();
	const utils = render(TemperamentEditor, { props: { value, labels, onsave, onclose } });
	return { onsave, onclose, ...utils };
}

describe('TemperamentEditor', () => {
	it('seeds the three name fields from the built-in defaults', () => {
		renderEditor();
		expect(screen.getByLabelText('MAGI • 1 temperament name')).toHaveValue(
			defaultNodeTemperament('MELCHIOR').label
		);
		expect(screen.getByLabelText('MAGI • 3 temperament name')).toHaveValue(
			defaultNodeTemperament('CASPAR').label
		);
	});

	it('saving with no edits emits an empty (sparse) override map', async () => {
		const { onsave, onclose } = renderEditor();
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(onsave).toHaveBeenCalledWith({});
		expect(onclose).toHaveBeenCalled();
	});

	it('saving emits only the edited seat', async () => {
		const { onsave } = renderEditor();
		const nameField = screen.getByLabelText('MAGI • 1 temperament name');
		await fireEvent.input(nameField, { target: { value: 'Skeptic' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(onsave).toHaveBeenCalledTimes(1);
		const saved = onsave.mock.calls[0][0];
		expect(Object.keys(saved)).toEqual(['MELCHIOR']);
		expect(saved.MELCHIOR.label).toBe('Skeptic');
	});

	it('seeds from an existing override', () => {
		renderEditor({ BALTHASAR: { label: 'Guardian', prompt: 'Protect everyone.' } });
		expect(screen.getByLabelText('MAGI • 2 temperament name')).toHaveValue('Guardian');
		expect(screen.getByLabelText('MAGI • 2 persona')).toHaveValue('Protect everyone.');
	});

	it('reset restores a seat to its default and drops it from the saved map', async () => {
		const { onsave } = renderEditor({ CASPAR: { label: 'Maverick', prompt: 'Break the rules.' } });
		// CASPAR's default is Individualist, so its reset button is uniquely named.
		await fireEvent.click(screen.getByRole('button', { name: 'Reset to Individualist' }));
		// After reset CASPAR matches the default, so Save emits an empty map.
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(onsave).toHaveBeenCalledWith({});
	});

	it('calls onclose from the Cancel button', async () => {
		const { onclose, onsave } = renderEditor();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onclose).toHaveBeenCalled();
		expect(onsave).not.toHaveBeenCalled();
	});
});
