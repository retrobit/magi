import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import ThinkingChip from './ThinkingChip.svelte';

afterEach(() => vi.useRealTimers());

describe('ThinkingChip', () => {
	it('counts whole seconds since the signal and announces only "Thinking"', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(10_000);
		const { getByRole } = render(ThinkingChip, { props: { since: 7_500 } });
		const chip = getByRole('status');
		expect(chip.getAttribute('aria-label')).toBe('Thinking');
		expect(chip.textContent).toContain('Thinking 2s');
		vi.advanceTimersByTime(3_000);
		await tick();
		expect(chip.textContent).toContain('Thinking 5s');
	});
});
