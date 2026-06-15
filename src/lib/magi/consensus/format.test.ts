import { describe, it, expect } from 'vitest';
import { consensusFormat } from './format';

describe('consensusFormat', () => {
	it('defaults to the unified skeleton', () => {
		expect(consensusFormat()).toBe(consensusFormat(false));
	});

	it('uses Verdict / Reasoning / Confidence for a unified answer', () => {
		const fmt = consensusFormat(false);
		expect(fmt).toContain('## Verdict');
		expect(fmt).toContain('## Reasoning');
		expect(fmt).toContain('## Confidence');
		expect(fmt).not.toContain('## Positions');
	});

	it('swaps Reasoning for Positions and forbids crowning a winner when divided', () => {
		const fmt = consensusFormat(true);
		expect(fmt).toContain('## Verdict');
		expect(fmt).toContain('## Positions');
		expect(fmt).not.toContain('## Reasoning');
		expect(fmt).toContain('Do not pick a winner');
	});

	it('keeps Verdict and Confidence fixed across both skeletons', () => {
		for (const fmt of [consensusFormat(false), consensusFormat(true)]) {
			expect(fmt).toContain('## Verdict');
			expect(fmt).toContain('## Confidence');
			// One word — High / Medium / Low — opens the confidence section.
			expect(fmt).toContain('High, Medium, or Low');
		}
	});
});
