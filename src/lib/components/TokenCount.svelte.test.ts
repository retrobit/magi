import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TokenCount from './TokenCount.svelte';

describe('TokenCount', () => {
	it('shows both an input (↑) and an output (↓) figure', () => {
		render(TokenCount, { props: { input: 1200, output: 340 } });
		const text = screen.getByText(/↓/).textContent ?? '';
		expect(text).toContain('↑');
		expect(text).toContain('↓');
	});

	it('drops the ↑ input figure while a turn is still streaming (input 0)', () => {
		render(TokenCount, { props: { input: 0, output: 88 } });
		const text = screen.getByText(/↓/).textContent ?? '';
		expect(text).not.toContain('↑');
		expect(text).toContain('↓');
	});

	it('prefixes the figures with ~ when marked as an estimate', () => {
		render(TokenCount, { props: { input: 100, output: 50, estimated: true } });
		expect((screen.getByText(/↓/).textContent ?? '').startsWith('~')).toBe(true);
	});

	it('appends a combined total when total is set', () => {
		render(TokenCount, { props: { input: 100, output: 50, total: true } });
		expect(screen.getByText(/↓/).textContent).toContain('·');
	});

	it('omits the total when input is 0 even with total set', () => {
		render(TokenCount, { props: { input: 0, output: 50, total: true } });
		expect(screen.getByText(/↓/).textContent).not.toContain('·');
	});

	it('shows a ⚡ cached slice only when cached is above 0', () => {
		const { unmount } = render(TokenCount, { props: { input: 100, output: 50, cached: 40 } });
		expect(screen.getByText(/↓/).textContent).toContain('⚡');
		unmount();
		render(TokenCount, { props: { input: 100, output: 50, cached: 0 } });
		expect(screen.getByText(/↓/).textContent).not.toContain('⚡');
	});
});
