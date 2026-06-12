import { streamText, type ModelMessage } from 'ai';
import {
	nodeIdentities,
	type ConsensusStrategy,
	type ConsensusContext,
	type ConsensusEvent,
	SECTION_RULE
} from './types';
import {
	NODE_TEMPERAMENTS,
	NODE_LABELS,
	NODE_LABELS_GENERIC,
	TEMPERAMENT_LABELS,
	type MagiNodeName
} from '../types';
import { TEMPERAMENT_SYSTEM_PROMPTS } from '../temperaments';
import { markCacheBreakpoint } from '../prompt-cache';

export const synthesisStrategy: ConsensusStrategy = {
	name: 'synthesis',
	description: 'One model synthesizes the best answer from all three responses',

	async *execute(ctx: ConsensusContext): AsyncIterable<ConsensusEvent> {
		const {
			responses,
			query,
			history = [],
			getModel,
			nodeAssignments,
			consensusNodeIndex,
			consensusTemperament,
			synthesizerAwareness,
			genericLabels,
			signal,
			tier
		} = ctx;

		const nodeLabels = genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS;

		const formattedResponses = responses
			.map((r) => {
				const nodeName = nodeLabels[r.node];
				const label = synthesizerAwareness
					? `${nodeName} (${r.provider}) — ${TEMPERAMENT_LABELS[NODE_TEMPERAMENTS[r.node]]}`
					: `${nodeName} (${r.provider})`;
				return `=== ${label} ===\n${r.text}`;
			})
			.join('\n\n');

		// Name the absentees so the synthesizer can acknowledge them in the
		// reply — readers expect three perspectives, and a silent two-of-three
		// consensus reads as if nothing went wrong.
		const missingLabels = nodeAssignments
			.filter((a) => !responses.some((r) => r.node === a.node))
			.map((a) => nodeLabels[a.node]);
		const missingClause =
			missingLabels.length > 0
				? `\n\nUnavailable for this query: ${missingLabels.join(', ')}. Acknowledge ${
						missingLabels.length === 1 ? 'this absence' : 'these absences'
					} briefly so the reader knows the consensus is missing ${
						missingLabels.length === 1 ? 'a perspective' : 'perspectives'
					} — do not let absent MAGI vanish silently.`
				: '';

		const assignment = nodeAssignments[consensusNodeIndex];
		const model = getModel(assignment.gateway, assignment.modelId);

		const n = responses.length;
		const countDesc =
			n === 3
				? 'Three independent AI models have each responded'
				: `${n} of three independent AI models responded`;

		const consensusNode = nodeAssignments[consensusNodeIndex].node as MagiNodeName;
		const consensusLens = consensusTemperament
			? `${TEMPERAMENT_SYSTEM_PROMPTS[NODE_TEMPERAMENTS[consensusNode]]}${SECTION_RULE}`
			: '';

		const awarenessContext = synthesizerAwareness
			? `\n\nEach model responded through a distinct dispositional lens:
- Rationalist: cold logic, empirical reasoning, data above all.
- Caretaker: empathy-first, weighs human cost and safety.
- Individualist: bold conviction, authenticity, the perspective no one else would give.

When perspectives diverge, surface WHY they diverge — which dispositional lens drives the disagreement. For example: "The Rationalist and Individualist agree on X, but the Caretaker flags Y as a human cost."`
			: '';

		const synthesisPrompt = `Original query: ${query}

The ${n === 3 ? 'three' : n} MAGI responses:

${formattedResponses}${missingClause}

Provide the synthesized consensus response.`;

		// Replay prior consensus turns so follow-ups ("expand on that") stay coherent.
		// Past turns carry only the bare question + consensus; the current turn carries
		// the full synthesis prompt with this round's fresh node responses.
		const messages: ModelMessage[] = [];
		for (const turn of history) {
			// A failed or aborted turn commits with an empty consensus — skip the
			// pair rather than replay an empty assistant message, which some
			// providers reject outright.
			if (!turn.consensus) continue;
			messages.push({ role: 'user', content: turn.query });
			messages.push({ role: 'assistant', content: turn.consensus });
		}
		messages.push({ role: 'user', content: synthesisPrompt });
		// Cache the replayed consensus thread — a no-op for non-Anthropic gateways.
		markCacheBreakpoint(messages);

		const result = streamText({
			model,
			system: `${consensusLens}You are the MAGI consensus system. ${countDesc} to the same query. Your job is to synthesize the best possible answer by:

1. Identifying where the ${n === 3 ? 'three' : 'available'} responses agree — these points are likely reliable.
2. Noting where they disagree and evaluating which perspective is strongest.
3. Combining the best elements into a single, clear, definitive response.
4. Flagging any remaining uncertainty honestly.

Do NOT simply concatenate or summarize the responses. Produce a unified answer that is better than any individual response.${awarenessContext}`,
			messages,
			abortSignal: signal
		});

		let fullText = '';
		for await (const chunk of result.textStream) {
			fullText += chunk;
			yield { type: 'text-delta', text: chunk };
		}
		const usage = await result.usage;
		yield { type: 'complete', fullText };
		yield {
			type: 'usage',
			inputTokens: usage.inputTokens ?? 0,
			outputTokens: usage.outputTokens ?? 0,
			cachedInputTokens: usage.cachedInputTokens ?? 0
		};
		// Synthesis crowns no winner, so it contributes usage axes only — no
		// `voting` block. Lets the stats panel count synthesis runs alongside votes.
		yield {
			type: 'run-stats',
			stats: {
				strategy: 'synthesis',
				tier: tier ?? 'unknown',
				synthesizerAwareness: synthesizerAwareness ?? false,
				consensusTemperament: consensusTemperament ?? false,
				nodes: nodeIdentities(responses, nodeAssignments)
			}
		};
	}
};
