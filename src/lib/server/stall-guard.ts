/** A child abort signal that fires when `parent` aborts OR when `reset()` hasn't
 *  been called within the current window — `firstMs` at the start, then the
 *  window passed to each `reset(ms)` (default `idleMs`). Call `cleanup()` when the
 *  stream ends. `stalledAfterMs()` is the window that tripped (null if the idle
 *  timer never fired), so a stall can be labelled distinctly from a client
 *  teardown and with its real length. The timer self-clears whenever the signal
 *  aborts. */
export function createStallGuard(parent: AbortSignal, idleMs: number, firstMs = idleMs) {
	const controller = new AbortController();
	let stalledAfter: number | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const onParentAbort = () => controller.abort(parent.reason);
	if (parent.aborted) controller.abort(parent.reason);
	else parent.addEventListener('abort', onParentAbort, { once: true });
	// Whatever aborts the call (idle fire or client), stop the pending timer.
	controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
	const reset = (ms = idleMs) => {
		if (controller.signal.aborted) return;
		clearTimeout(timer);
		timer = setTimeout(() => {
			stalledAfter = ms;
			controller.abort(new Error(`Stalled — no output for ${Math.round(ms / 1000)}s`));
		}, ms);
	};
	const cleanup = () => {
		clearTimeout(timer);
		parent.removeEventListener('abort', onParentAbort);
	};
	reset(firstMs);
	return {
		signal: controller.signal,
		reset,
		cleanup,
		timedOut: () => stalledAfter !== null,
		stalledAfterMs: () => stalledAfter
	};
}

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
