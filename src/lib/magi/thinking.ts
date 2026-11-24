// Visible-thinking detection, shared by the route (node streams) and the
// consensus strategies (the synthesizer's stream). Pure — safe in any bundle.

/** Whether a streamText `fullStream` part shows the model is thinking. Claude and
 *  the GPT Responses API surface reasoning as parts; OpenRouter's chat endpoint
 *  streams it as `delta.reasoning` text that the AI SDK's chat model drops, so it
 *  is read from the raw chunk (requested with `includeRawChunks`). */
export function isThinkingPart(part: { type: string; rawValue?: unknown }): boolean {
	if (part.type === 'reasoning-start' || part.type === 'reasoning-delta') return true;
	if (part.type !== 'raw') return false;
	const delta = (
		part.rawValue as {
			choices?: { delta?: { reasoning?: unknown; reasoning_details?: unknown } }[];
		}
	)?.choices?.[0]?.delta;
	if (!delta) return false;
	return (
		(typeof delta.reasoning === 'string' && delta.reasoning.length > 0) ||
		(Array.isArray(delta.reasoning_details) && delta.reasoning_details.length > 0)
	);
}

/** Stream a model call's answer, surfacing visible thinking as its own events.
 *  `fullStream` ends quietly on abort, so an abort is rethrown here: a stall
 *  mid-answer must never pass for a complete reply. */
export async function* answerParts(result: {
	fullStream: AsyncIterable<{ type: string; text?: string; rawValue?: unknown }>;
}): AsyncGenerator<{ type: 'text-delta'; text: string } | { type: 'thinking' }> {
	for await (const part of result.fullStream) {
		if (part.type === 'text-delta') yield { type: 'text-delta', text: part.text ?? '' };
		else if (isThinkingPart(part)) yield { type: 'thinking' };
		else if (part.type === 'abort') throw new Error('The model call was aborted.');
	}
}
