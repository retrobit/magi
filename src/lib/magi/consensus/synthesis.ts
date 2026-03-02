import { streamText } from 'ai';
import type { ConsensusStrategy, ConsensusContext, ConsensusEvent } from './types';

export const synthesisStrategy: ConsensusStrategy = {
	name: 'synthesis',
	description: 'One model synthesizes the best answer from all three responses',

	async *execute(ctx: ConsensusContext): AsyncIterable<ConsensusEvent> {
		const { responses, query, getModel, tier, consensusProvider, signal } = ctx;

		const formattedResponses = responses
			.map((r) => `=== ${r.node} (${r.provider}) ===\n${r.text}`)
			.join('\n\n');

		const model = getModel(consensusProvider, tier);

		const n = responses.length;
		const countDesc =
			n === 3
				? 'Three independent AI models have each responded'
				: `${n} of three independent AI models responded`;

		const result = streamText({
			model,
			system: `You are the MAGI consensus system. ${countDesc} to the same query. Your job is to synthesize the best possible answer by:

1. Identifying where the ${n === 3 ? 'three' : 'available'} responses agree — these points are likely reliable.
2. Noting where they disagree and evaluating which perspective is strongest.
3. Combining the best elements into a single, clear, definitive response.
4. Flagging any remaining uncertainty honestly.

Do NOT simply concatenate or summarize the responses. Produce a unified answer that is better than any individual response.`,
			prompt: `Original query: ${query}

The ${n === 3 ? 'three' : n} MAGI responses:

${formattedResponses}

Provide the synthesized consensus response.`,
			abortSignal: signal
		});

		let fullText = '';
		for await (const chunk of result.textStream) {
			fullText += chunk;
			yield { type: 'text-delta', text: chunk };
		}
		yield { type: 'complete', fullText };
	}
};
