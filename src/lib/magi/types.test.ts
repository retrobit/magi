import { describe, it, expect } from 'vitest';
import {
	isRouter,
	DEFAULT_TIER,
	estimateTokens,
	tokenUsageTooltip,
	getProviderLabel
} from './types';

describe('DEFAULT_TIER', () => {
	// The public demo 403s every other tier, so the default must stay free.
	it('defaults to free tier', () => {
		expect(DEFAULT_TIER).toBe('free');
	});
});

describe('isRouter', () => {
	it('returns true for router gateways', () => {
		expect(isRouter('openrouter')).toBe(true);
	});

	it('returns false for direct provider gateways', () => {
		expect(isRouter('anthropic')).toBe(false);
		expect(isRouter('openai')).toBe(false);
		expect(isRouter('google')).toBe(false);
	});
});

describe('estimateTokens', () => {
	it('returns 0 for empty text', () => {
		expect(estimateTokens('')).toBe(0);
	});

	it('estimates roughly four characters per token', () => {
		expect(estimateTokens('abcd')).toBe(1);
		expect(estimateTokens('a'.repeat(400))).toBe(100);
	});

	it('rounds partial tokens up', () => {
		expect(estimateTokens('ab')).toBe(1);
		expect(estimateTokens('abcde')).toBe(2);
	});
});

describe('tokenUsageTooltip', () => {
	const base = {
		contextUsed: 0,
		contextWindow: undefined as number | undefined,
		totalInput: 0,
		totalOutput: 0,
		totalCached: 0
	};

	it('returns an empty string when there is nothing to show', () => {
		expect(tokenUsageTooltip(base)).toBe('');
	});

	it('omits the context line when no window is known', () => {
		const t = tokenUsageTooltip({ ...base, totalInput: 10, totalOutput: 20 });
		expect(t).not.toContain('Context');
		expect(t).toBe('↑ 10 in · ↓ 20 out · 30 total');
	});

	it('omits the context line when a window is known but nothing is used yet', () => {
		const t = tokenUsageTooltip({ ...base, contextWindow: 1000, totalInput: 10 });
		expect(t).not.toContain('Context');
	});

	it('joins the context and token segments with an em-dash', () => {
		const t = tokenUsageTooltip({
			...base,
			contextUsed: 1500,
			contextWindow: 8000,
			totalInput: 100,
			totalOutput: 200
		});
		expect(t).toBe(
			`Context ${(1500).toLocaleString()} / ${(8000).toLocaleString()} tokens  —  ` +
				`↑ ${(100).toLocaleString()} in · ↓ ${(200).toLocaleString()} out · ${(300).toLocaleString()} total`
		);
	});

	it('appends the cached segment only when cached > 0', () => {
		const withCache = tokenUsageTooltip({ ...base, totalInput: 100, totalCached: 40 });
		expect(withCache).toContain('⚡');
		expect(withCache).toContain('cached');
		expect(tokenUsageTooltip({ ...base, totalInput: 100 })).not.toContain('⚡');
	});

	it('shows only the context line when no tokens have been counted', () => {
		const t = tokenUsageTooltip({ ...base, contextUsed: 500, contextWindow: 1000 });
		expect(t).toBe(`Context ${(500).toLocaleString()} / ${(1000).toLocaleString()} tokens`);
	});
});

describe('getProviderLabel', () => {
	it('returns the curated label for a known provider', () => {
		expect(getProviderLabel('deepseek')).toBe('DeepSeek');
	});

	it('title-cases an unknown hyphenated provider slug', () => {
		expect(getProviderLabel('some-new-provider')).toBe('Some New Provider');
	});
});
