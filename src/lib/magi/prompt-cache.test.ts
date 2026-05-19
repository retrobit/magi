import { describe, it, expect } from 'vitest';
import type { ModelMessage } from 'ai';
import { markCacheBreakpoint } from './prompt-cache';

describe('markCacheBreakpoint', () => {
	it('puts an ephemeral Anthropic cache breakpoint on the final message', () => {
		const messages: ModelMessage[] = [
			{ role: 'user', content: 'one' },
			{ role: 'assistant', content: 'two' },
			{ role: 'user', content: 'three' }
		];
		markCacheBreakpoint(messages);
		expect(messages[2].providerOptions).toEqual({
			anthropic: { cacheControl: { type: 'ephemeral' } }
		});
	});

	it('leaves earlier messages untouched', () => {
		const messages: ModelMessage[] = [
			{ role: 'user', content: 'one' },
			{ role: 'user', content: 'two' }
		];
		markCacheBreakpoint(messages);
		expect(messages[0].providerOptions).toBeUndefined();
	});

	it('merges with existing providerOptions rather than clobbering them', () => {
		const messages: ModelMessage[] = [
			{ role: 'user', content: 'one', providerOptions: { openai: { reasoningEffort: 'high' } } }
		];
		markCacheBreakpoint(messages);
		expect(messages[0].providerOptions).toEqual({
			openai: { reasoningEffort: 'high' },
			anthropic: { cacheControl: { type: 'ephemeral' } }
		});
	});

	it('is a no-op for an empty message list', () => {
		expect(() => markCacheBreakpoint([])).not.toThrow();
	});
});
