import { describe, it, expect } from 'vitest';
import {
	MODEL_REGISTRY,
	getModelEntry,
	getModelsForProvider,
	getAvailableProviders
} from './registry';
import { TIER_NAMES, PROVIDER_NAMES } from './types';

describe('MODEL_REGISTRY', () => {
	it('has an entry for every provider-tier combination', () => {
		for (const provider of PROVIDER_NAMES) {
			for (const tier of TIER_NAMES) {
				const entry = MODEL_REGISTRY.find((e) => e.provider === provider && e.tier === tier);
				expect(entry, `Missing entry for ${provider}/${tier}`).toBeDefined();
			}
		}
	});
});

describe('getModelEntry', () => {
	it('returns the correct entry', () => {
		const entry = getModelEntry('anthropic', 'frontier');
		expect(entry.id).toBe('claude-opus-4-6');
		expect(entry.displayName).toBe('Claude Opus 4.6');
	});

	it('throws for unknown combination', () => {
		expect(() => getModelEntry('anthropic' as never, 'unknown' as never)).toThrow(
			'No model registered'
		);
	});
});

describe('getModelsForProvider', () => {
	it('returns all models for a provider', () => {
		const models = getModelsForProvider('anthropic');
		expect(models).toHaveLength(3);
		expect(models.every((m) => m.provider === 'anthropic')).toBe(true);
	});
});

describe('getAvailableProviders', () => {
	it('returns all three providers', () => {
		const providers = getAvailableProviders();
		expect(providers).toHaveLength(3);
		expect(providers).toContain('anthropic');
		expect(providers).toContain('openai');
		expect(providers).toContain('google');
	});
});
