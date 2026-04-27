import { describe, it, expect } from 'vitest';
import {
	MAGI_NODES,
	MAGI_NODE_NAMES,
	TIER_NAMES,
	GATEWAY_NAMES,
	PROVIDER_NAMES,
	ROUTER_GATEWAYS,
	isRouter,
	DEFAULT_TIER
} from './types';

describe('MAGI_NODES', () => {
	it('defines exactly three nodes', () => {
		expect(MAGI_NODES).toHaveLength(3);
	});

	it('uses the canonical MAGI names', () => {
		const names = MAGI_NODES.map((n) => n.name);
		expect(names).toEqual(['MELCHIOR', 'BALTHASAR', 'CASPAR']);
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
	it('includes direct providers and router-hosted providers', () => {
		expect(PROVIDER_NAMES).toContain('anthropic');
		expect(PROVIDER_NAMES).toContain('openai');
		expect(PROVIDER_NAMES).toContain('google');
		expect(PROVIDER_NAMES).toContain('qwen');
		expect(PROVIDER_NAMES).toContain('nvidia');
		expect(PROVIDER_NAMES).toContain('meta-llama');
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
