import { streamText } from 'ai';
import type { LanguageModel } from 'ai';
import type { MagiResponse } from '../types';
import type { ConsensusStrategy } from './types';

export const synthesisStrategy: ConsensusStrategy = {
	name: 'synthesis',
	description: 'One model synthesizes the best answer from all three responses',

	execute(responses: MagiResponse[], query: string, model: LanguageModel) {
		const formattedResponses = responses
			.map(
				(r) =>
					`=== ${r.node.name} (${r.node.provider}) ===\n${r.text}`
			)
			.join('\n\n');

		return streamText({
			model,
			system: `You are the MAGI consensus system. Three independent AI models have each responded to the same query. Your job is to synthesize the best possible answer by:

1. Identifying where the three responses agree — these points are likely reliable.
2. Noting where they disagree and evaluating which perspective is strongest.
3. Combining the best elements into a single, clear, definitive response.
4. Flagging any remaining uncertainty honestly.

Do NOT simply concatenate or summarize the responses. Produce a unified answer that is better than any individual response.`,
			prompt: `Original query: ${query}

The three MAGI responses:

${formattedResponses}

Provide the synthesized consensus response.`
		});
	}
};
