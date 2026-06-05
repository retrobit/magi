import { describe, it, expect } from 'vitest';
import { DEFAULT_MAGI_CONFIG, FREE_MAGI_CONFIG, TIER_CONFIGS, validateConfig } from './config';
import type { MagiConfig } from './config';
import { findModelEntry } from './registry';

describe('DEFAULT_MAGI_CONFIG', () => {
	it('assigns all three canonical nodes', () => {
		const nodes = DEFAULT_MAGI_CONFIG.map((a) => a.node);
		expect(nodes).toEqual(['MELCHIOR', 'BALTHASAR', 'CASPAR']);
	});

	it('uses unique providers', () => {
		const providers = DEFAULT_MAGI_CONFIG.map((a) => a.provider);
		expect(new Set(providers).size).toBe(3);
	});

	it('uses unique gateways', () => {
		const gateways = DEFAULT_MAGI_CONFIG.map((a) => a.gateway);
		expect(new Set(gateways).size).toBe(3);
	});

	it('has explicit modelId for each node', () => {
		for (const a of DEFAULT_MAGI_CONFIG) {
			expect(a.modelId).toBeTruthy();
		}
	});

	it('passes validation', () => {
		expect(() => validateConfig(DEFAULT_MAGI_CONFIG)).not.toThrow();
	});
});

describe('FREE_MAGI_CONFIG', () => {
	it('assigns all three canonical nodes', () => {
		const nodes = FREE_MAGI_CONFIG.map((a) => a.node);
		expect(nodes).toEqual(['MELCHIOR', 'BALTHASAR', 'CASPAR']);
	});

	it('uses openrouter for all nodes', () => {
		expect(FREE_MAGI_CONFIG.every((a) => a.gateway === 'openrouter')).toBe(true);
	});

	it('uses unique providers per node', () => {
		const providers = FREE_MAGI_CONFIG.map((a) => a.provider);
		expect(new Set(providers).size).toBe(3);
	});

	it('uses unique models per node', () => {
		const models = FREE_MAGI_CONFIG.map((a) => a.modelId);
		expect(new Set(models).size).toBe(3);
	});

	it('passes validation', () => {
		expect(() => validateConfig(FREE_MAGI_CONFIG)).not.toThrow();
	});
});

describe('TIER_CONFIGS', () => {
	it('has an entry for every tier', () => {
		expect(Object.keys(TIER_CONFIGS)).toEqual(['frontier', 'balanced', 'budget', 'free']);
	});

	it('maps free to FREE_MAGI_CONFIG', () => {
		expect(TIER_CONFIGS.free).toBe(FREE_MAGI_CONFIG);
	});

	it('maps balanced to DEFAULT_MAGI_CONFIG', () => {
		expect(TIER_CONFIGS.balanced).toBe(DEFAULT_MAGI_CONFIG);
	});

	it('each tier config uses tier-appropriate models', () => {
		// Frontier should use the most capable models
		expect(TIER_CONFIGS.frontier[0].modelId).toBe('claude-opus-4-7');
		expect(TIER_CONFIGS.frontier[2].modelId).toBe('gemini-2.5-pro');
		// Budget should use the cheapest models
		expect(TIER_CONFIGS.budget[0].modelId).toBe('claude-haiku-4-5');
		expect(TIER_CONFIGS.budget[2].modelId).toBe('gemini-3.1-flash-lite');
	});

	it('all tier configs pass validation', () => {
		for (const config of Object.values(TIER_CONFIGS)) {
			expect(() => validateConfig(config)).not.toThrow();
		}
	});

	// Defensive cross-check — catches the kind of drift where a freshness
	// sweep updates the registry but forgets to propagate the change into
	// TIER_CONFIGS (and vice versa). OpenRouter entries are intentionally
	// skipped: free-tier model IDs are resolved dynamically at request time
	// and aren't carried in the static registry.
	it('every direct-API tier-config entry maps to a registry model', () => {
		for (const [tier, config] of Object.entries(TIER_CONFIGS)) {
			for (const a of config) {
				if (a.gateway === 'openrouter') continue;
				const entry = findModelEntry(a.gateway, a.modelId, tier as keyof typeof TIER_CONFIGS);
				expect(
					entry,
					`TIER_CONFIGS.${tier} references unknown model "${a.modelId}" on gateway "${a.gateway}"`
				).toBeDefined();
			}
		}
	});
});

describe('validateConfig', () => {
	it('throws on duplicate providers', () => {
		const config: MagiConfig = [
			{ node: 'MELCHIOR', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-opus-4-6' },
			{ node: 'BALTHASAR', gateway: 'openai', provider: 'anthropic', modelId: 'claude-sonnet-4-6' },
			{ node: 'CASPAR', gateway: 'google', provider: 'google', modelId: 'gemini-3-flash' }
		];
		expect(() => validateConfig(config)).toThrow('Duplicate providers');
	});

	it('throws on duplicate models', () => {
		const config: MagiConfig = [
			{ node: 'MELCHIOR', gateway: 'anthropic', provider: 'anthropic', modelId: 'same-model' },
			{ node: 'BALTHASAR', gateway: 'openai', provider: 'openai', modelId: 'same-model' },
			{ node: 'CASPAR', gateway: 'google', provider: 'google', modelId: 'gemini-3-flash' }
		];
		expect(() => validateConfig(config)).toThrow('Duplicate models');
	});

	it('throws when a direct gateway is used by multiple nodes', () => {
		const config: MagiConfig = [
			{ node: 'MELCHIOR', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-opus-4-6' },
			{ node: 'BALTHASAR', gateway: 'anthropic', provider: 'openai', modelId: 'gpt-4o' },
			{ node: 'CASPAR', gateway: 'google', provider: 'google', modelId: 'gemini-3-flash' }
		];
		expect(() => validateConfig(config)).toThrow('Direct gateway');
	});

	it('allows router gateway shared across nodes with different providers', () => {
		const config: MagiConfig = [
			{
				node: 'MELCHIOR',
				gateway: 'openrouter',
				provider: 'qwen',
				modelId: 'qwen/qwen3-coder:free'
			},
			{
				node: 'BALTHASAR',
				gateway: 'openrouter',
				provider: 'nvidia',
				modelId: 'nvidia/nemotron-3-super-120b-a12b:free'
			},
			{
				node: 'CASPAR',
				gateway: 'openrouter',
				provider: 'meta-llama',
				modelId: 'meta-llama/llama-3.3-70b-instruct:free'
			}
		];
		expect(() => validateConfig(config)).not.toThrow();
	});

	it('throws on duplicate nodes', () => {
		const config = [
			{ node: 'MELCHIOR', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-opus-4-6' },
			{ node: 'MELCHIOR', gateway: 'openai', provider: 'openai', modelId: 'gpt-4o' },
			{ node: 'CASPAR', gateway: 'google', provider: 'google', modelId: 'gemini-3-flash' }
		] as unknown as MagiConfig;
		expect(() => validateConfig(config)).toThrow('Duplicate nodes');
	});

	it('throws when a canonical node is missing', () => {
		const config = [
			{ node: 'MELCHIOR', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-opus-4-6' },
			{ node: 'BALTHASAR', gateway: 'openai', provider: 'openai', modelId: 'gpt-4o' },
			{ node: 'UNKNOWN', gateway: 'google', provider: 'google', modelId: 'gemini-3-flash' }
		] as unknown as MagiConfig;
		expect(() => validateConfig(config)).toThrow('Missing node assignment');
	});

	it('allows mixed config with router and direct gateways', () => {
		const config: MagiConfig = [
			{ node: 'MELCHIOR', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-opus-4-6' },
			{
				node: 'BALTHASAR',
				gateway: 'openrouter',
				provider: 'qwen',
				modelId: 'qwen/qwen3-coder:free'
			},
			{
				node: 'CASPAR',
				gateway: 'openrouter',
				provider: 'nvidia',
				modelId: 'nvidia/nemotron-3-super-120b-a12b:free'
			}
		];
		expect(() => validateConfig(config)).not.toThrow();
	});
});
