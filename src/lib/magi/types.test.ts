import { describe, it, expect } from 'vitest';
import {
	MAGI_NODES,
	MAGI_NODE_NAMES,
	TIER_NAMES,
	GATEWAY_NAMES,
	PROVIDER_NAMES,
	ROUTER_GATEWAYS,
	isRouter,
	DEFAULT_TIER,
	estimateTokens,
	tokenUsageTooltip,
	pickDiverseModels
} from './types';
import type { AvailableModel } from './types';

const model = (id: string, provider: string): AvailableModel => ({
	id,
	gateway: 'openrouter',
	provider,
	displayName: id
});

describe('MAGI_NODES', () => {
	it('defines exactly three nodes', () => {
		expect(MAGI_NODES).toHaveLength(3);
	});

	it('uses the canonical MAGI names', () => {
		const names = MAGI_NODES.map((n) => n.name);
		expect(names).toEqual(['MAGI_1', 'MAGI_2', 'MAGI_3']);
	});
});

describe('MAGI_NODE_NAMES', () => {
	it('matches MAGI_NODES', () => {
		expect([...MAGI_NODE_NAMES]).toEqual(MAGI_NODES.map((n) => n.name));
	});
});

describe('TIER_NAMES', () => {
	it('defines four tiers', () => {
		expect(TIER_NAMES).toEqual(['free', 'budget', 'balanced', 'frontier']);
	});

	it('defaults to free tier', () => {
		expect(DEFAULT_TIER).toBe('free');
	});
});

describe('GATEWAY_NAMES', () => {
	it('defines four gateways', () => {
		expect(GATEWAY_NAMES).toEqual(['anthropic', 'openai', 'google', 'openrouter']);
	});
});

describe('PROVIDER_NAMES', () => {
	it('includes direct API providers (OpenRouter providers are dynamic)', () => {
		expect(PROVIDER_NAMES).toContain('anthropic');
		expect(PROVIDER_NAMES).toContain('openai');
		expect(PROVIDER_NAMES).toContain('google');
		expect(PROVIDER_NAMES).toHaveLength(3);
	});
});

describe('ROUTER_GATEWAYS', () => {
	it('identifies openrouter as a router', () => {
		expect(ROUTER_GATEWAYS).toContain('openrouter');
	});

	it('does not include direct provider gateways', () => {
		expect(ROUTER_GATEWAYS).not.toContain('anthropic');
		expect(ROUTER_GATEWAYS).not.toContain('openai');
		expect(ROUTER_GATEWAYS).not.toContain('google');
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

describe('pickDiverseModels', () => {
	it('picks one model per provider, first-of-each, when providers are plentiful', () => {
		const pool = [
			model('a/1', 'a'),
			model('a/2', 'a'),
			model('b/1', 'b'),
			model('c/1', 'c'),
			model('d/1', 'd')
		];
		const picked = pickDiverseModels(pool, 3);
		expect(picked.map((m) => m.id)).toEqual(['a/1', 'b/1', 'c/1']);
	});

	it('backfills with duplicate-provider models so it still returns `count`', () => {
		// Only two distinct providers but four models — must still yield three.
		const pool = [model('a/1', 'a'), model('a/2', 'a'), model('b/1', 'b'), model('a/3', 'a')];
		const picked = pickDiverseModels(pool, 3);
		expect(picked).toHaveLength(3);
		// Diversity first (a/1, b/1), then the leftover fills the third slot.
		expect(picked.map((m) => m.id)).toEqual(['a/1', 'b/1', 'a/2']);
	});

	it('returns everything when the pool is smaller than `count`', () => {
		const picked = pickDiverseModels([model('a/1', 'a'), model('b/1', 'b')], 3);
		expect(picked).toHaveLength(2);
	});
});
