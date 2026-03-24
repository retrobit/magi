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

	it('has entries for openrouter free tier', () => {
		const freeEntries = MODEL_REGISTRY.filter((e) => e.gateway === 'openrouter' && e.tier === 'free');
		expect(freeEntries).toHaveLength(3);
	});

	it('every entry has a provider field', () => {
		for (const entry of MODEL_REGISTRY) {
			expect(entry.provider).toBeTruthy();
		}
	});

	it('direct gateway entries have matching provider', () => {
		for (const entry of MODEL_REGISTRY) {
			if (entry.gateway !== 'openrouter') {
				expect(entry.provider).toBe(entry.gateway);
			}
		}
	});

	it('openrouter entries have distinct providers', () => {
		const orProviders = MODEL_REGISTRY.filter((e) => e.gateway === 'openrouter').map((e) => e.provider);
		expect(new Set(orProviders).size).toBe(orProviders.length);
	});
});

describe('getModelsForTier', () => {
	it('returns models for balanced tier', () => {
		const models = getModelsForTier('balanced');
		expect(models.length).toBeGreaterThanOrEqual(3);
		expect(models.every((m) => m.tier === 'balanced')).toBe(true);
	});

	it('returns 3 free-tier models', () => {
		const models = getModelsForTier('free');
		expect(models).toHaveLength(3);
		expect(models.every((m) => m.gateway === 'openrouter')).toBe(true);
	});
});

describe('getModelsForGateway', () => {
	it('returns all models for a direct gateway', () => {
		const models = getModelsForGateway('anthropic');
		expect(models).toHaveLength(3);
		expect(models.every((m) => m.gateway === 'anthropic')).toBe(true);
	});

	it('returns all free-tier models for openrouter', () => {
		const models = getModelsForGateway('openrouter');
		expect(models).toHaveLength(3);
		expect(models.every((m) => m.gateway === 'openrouter')).toBe(true);
	});
});

describe('getModelsForProvider', () => {
	it('returns models for a direct provider', () => {
		const models = getModelsForProvider('anthropic');
		expect(models).toHaveLength(3);
		expect(models.every((m) => m.provider === 'anthropic')).toBe(true);
	});

	it('returns a single model for a router-hosted provider', () => {
		const models = getModelsForProvider('stepfun');
		expect(models).toHaveLength(1);
		expect(models[0].gateway).toBe('openrouter');
	});
});

describe('findModelEntry', () => {
	it('finds an existing model', () => {
		const entry = findModelEntry('anthropic', 'claude-opus-4-6');
		expect(entry).toBeDefined();
		expect(entry!.displayName).toBe('Claude Opus 4.6');
	});

	it('finds an openrouter model', () => {
		const entry = findModelEntry('openrouter', 'stepfun/step-3.5-flash:free');
		expect(entry).toBeDefined();
		expect(entry!.provider).toBe('stepfun');
	});

	it('returns undefined for unknown model', () => {
		expect(findModelEntry('anthropic', 'nonexistent')).toBeUndefined();
	});
});

describe('getAvailableGateways', () => {
	it('returns all four gateways', () => {
		const gateways = getAvailableGateways();
		expect(gateways).toHaveLength(4);
		expect(gateways).toContain('anthropic');
		expect(gateways).toContain('openai');
		expect(gateways).toContain('google');
		expect(gateways).toContain('openrouter');
	});
});

describe('getAvailableProviders', () => {
	it('returns all providers from the registry', () => {
		const providers = getAvailableProviders();
		expect(providers).toContain('anthropic');
		expect(providers).toContain('openai');
		expect(providers).toContain('google');
		expect(providers).toContain('stepfun');
		expect(providers).toContain('nvidia');
		expect(providers).toContain('arcee-ai');
	});
});
