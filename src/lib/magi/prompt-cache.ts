import type { ModelMessage } from 'ai';

/** Place an Anthropic prompt-caching breakpoint on the final message of a
 *  request. Each turn re-sends the whole replayed thread; with the breakpoint
 *  on the last message, that thread becomes a cacheable prefix the next turn
 *  reads back at ~10% of the input price instead of reprocessing it.
 *
 *  `providerOptions.anthropic` is namespaced — OpenAI, Google, and OpenRouter
 *  ignore it, so this is safe to apply unconditionally. OpenAI and Gemini 2.5
 *  already cache automatically; this closes the gap for Claude (every paid
 *  tier runs Claude in the MELCHIOR seat). */
export function markCacheBreakpoint(messages: ModelMessage[]): void {
	const last = messages.at(-1);
	if (!last) return;
	last.providerOptions = {
		...last.providerOptions,
		anthropic: { cacheControl: { type: 'ephemeral' } }
	};
}
