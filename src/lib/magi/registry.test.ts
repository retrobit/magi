import { describe, it, expect } from 'vitest';
import {
	MODEL_REGISTRY,
	getModelsForTier,
	getModelsForGateway,
	getModelsForProvider,
	findModelEntry,
	getAvailableGateways,
	getAvailableProviders
} from './registry';

describe('MODEL_REGISTRY', () => {
	it('has entries for all direct gateway tiers (frontier, balanced, budget)', () => {
		for (const gateway of ['anthropic', 'openai', 'google'] as const) {
			for (const tier of ['frontier', 'balanced', 'budget'] as const) {
				const entry = MODEL_REGISTRY.find((e) => e.gateway === gateway && e.tier === tier);
				expect(entry, `Missing entry for ${gateway}/${tier}`).toBeDefined();
			}
		}
	});

	it('has no static OpenRouter entries (free tier is dynamic)', () => {
		const orEntries = MODEL_REGISTRY.filter((e) => e.gateway === 'openrouter');
		expect(orEntries).toHaveLength(0);
	});

	it('every entry has a provider field', () => {
		for (const entry of MODEL_REGISTRY) {
			expect(entry.provider).toBeTruthy();
		}
	});

	it('direct gateway entries have matching provider', () => {
		for (const entry of MODEL_REGISTRY) {
			expect(entry.provider).toBe(entry.gateway);
		}
	});
});

describe('getModelsForTier', () => {
	it('returns models for balanced tier', () => {
		const models = getModelsForTier('balanced');
		expect(models.length).toBeGreaterThanOrEqual(3);
		expect(models.every((m) => m.tier === 'balanced')).toBe(true);
	});

	it('returns no static models for free tier', () => {
		const models = getModelsForTier('free');
		expect(models).toHaveLength(0);
	});
});

describe('getModelsForGateway', () => {
	it('returns all models for a direct gateway', () => {
		const models = getModelsForGateway('anthropic');
		expect(models).toHaveLength(3);
		expect(models.every((m) => m.gateway === 'anthropic')).toBe(true);
	});
});

describe('getModelsForProvider', () => {
	it('returns models for a direct provider', () => {
		const models = getModelsForProvider('anthropic');
		expect(models).toHaveLength(3);
		expect(models.every((m) => m.provider === 'anthropic')).toBe(true);
	});
});

describe('findModelEntry', () => {
	it('finds an existing model', () => {
		const entry = findModelEntry('anthropic', 'claude-opus-4-6');
		expect(entry).toBeDefined();
		expect(entry!.displayName).toBe('Claude Opus 4.6');
	});

	it('returns undefined for unknown model', () => {
		expect(findModelEntry('anthropic', 'nonexistent')).toBeUndefined();
	});
});

describe('getAvailableGateways', () => {
	it('returns direct gateways only (OpenRouter models are dynamic)', () => {
		const gateways = getAvailableGateways();
		expect(gateways).toHaveLength(3);
		expect(gateways).toContain('anthropic');
		expect(gateways).toContain('openai');
		expect(gateways).toContain('google');
	});
});

describe('getAvailableProviders', () => {
	it('returns direct providers', () => {
		const providers = getAvailableProviders();
		expect(providers).toContain('anthropic');
		expect(providers).toContain('openai');
		expect(providers).toContain('google');
	});
});
