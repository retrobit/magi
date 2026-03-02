import { describe, it, expect } from 'vitest';
import { DEFAULT_MAGI_CONFIG, validateConfig } from './config';
import type { MagiConfig } from './config';

describe('DEFAULT_MAGI_CONFIG', () => {
	it('assigns all three canonical nodes', () => {
		const nodes = DEFAULT_MAGI_CONFIG.map((a) => a.node);
		expect(nodes).toEqual(['MELCHIOR', 'BALTHASAR', 'CASPAR']);
	});

	it('uses unique providers', () => {
		const providers = DEFAULT_MAGI_CONFIG.map((a) => a.provider);
		expect(new Set(providers).size).toBe(3);
	});

	it('passes validation', () => {
		expect(() => validateConfig(DEFAULT_MAGI_CONFIG)).not.toThrow();
	});
});

describe('validateConfig', () => {
	it('throws on duplicate providers', () => {
		const config: MagiConfig = [
			{ node: 'MELCHIOR', provider: 'anthropic' },
			{ node: 'BALTHASAR', provider: 'anthropic' },
			{ node: 'CASPAR', provider: 'google' }
		];
		expect(() => validateConfig(config)).toThrow('Duplicate providers');
	});

	it('throws on duplicate nodes', () => {
		const config = [
			{ node: 'MELCHIOR', provider: 'anthropic' },
			{ node: 'MELCHIOR', provider: 'openai' },
			{ node: 'CASPAR', provider: 'google' }
		] as unknown as MagiConfig;
		expect(() => validateConfig(config)).toThrow('Duplicate nodes');
	});

	it('throws on missing nodes (caught by duplicate check)', () => {
		const config = [
			{ node: 'MELCHIOR', provider: 'anthropic' },
			{ node: 'BALTHASAR', provider: 'openai' },
			{ node: 'BALTHASAR', provider: 'google' }
		] as unknown as MagiConfig;
		expect(() => validateConfig(config)).toThrow('Duplicate nodes');
	});

	it('throws when a canonical node is missing', () => {
		const config = [
			{ node: 'MELCHIOR', provider: 'anthropic' },
			{ node: 'BALTHASAR', provider: 'openai' },
			{ node: 'UNKNOWN', provider: 'google' }
		] as unknown as MagiConfig;
		expect(() => validateConfig(config)).toThrow('Missing node assignment');
	});
});
