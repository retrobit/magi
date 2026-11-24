import { describe, it, expect } from 'vitest';
import { isThinkingPart, answerParts } from './thinking';

describe('isThinkingPart', () => {
	it('counts reasoning parts from Claude and the GPT Responses API', () => {
		expect(isThinkingPart({ type: 'reasoning-start' })).toBe(true);
		expect(isThinkingPart({ type: 'reasoning-delta' })).toBe(true);
		expect(isThinkingPart({ type: 'text-delta' })).toBe(false);
	});

	it('reads OpenRouter reasoning from the raw chunk the chat model drops', () => {
		const raw = (delta: object) => ({ type: 'raw', rawValue: { choices: [{ delta }] } });
		expect(isThinkingPart(raw({ reasoning: 'Let me think' }))).toBe(true);
		expect(isThinkingPart(raw({ reasoning_details: [{ type: 'reasoning.text' }] }))).toBe(true);
		expect(isThinkingPart(raw({ reasoning: '' }))).toBe(false);
		expect(isThinkingPart(raw({ content: 'answer' }))).toBe(false);
		expect(isThinkingPart({ type: 'raw', rawValue: 'not json' })).toBe(false);
	});
});

describe('answerParts', () => {
	const stream = (...parts: { type: string; text?: string; rawValue?: unknown }[]) => ({
		fullStream: (async function* () {
			yield* parts;
		})()
	});
	const collect = async (r: ReturnType<typeof stream>) => {
		const out = [];
		for await (const e of answerParts(r)) out.push(e);
		return out;
	};

	it('passes answer text through and turns visible thinking into events', async () => {
		expect(
			await collect(
				stream({ type: 'reasoning-start' }, { type: 'text-delta', text: 'hi' }, { type: 'finish' })
			)
		).toEqual([{ type: 'thinking' }, { type: 'text-delta', text: 'hi' }]);
	});

	it('rethrows an abort instead of ending as if the answer were complete', async () => {
		await expect(
			collect(stream({ type: 'text-delta', text: 'half' }, { type: 'abort' }))
		).rejects.toThrow('aborted');
	});
});
