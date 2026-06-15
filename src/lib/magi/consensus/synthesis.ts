import { streamText, type ModelMessage } from 'ai';
import {
	nodeIdentities,
	type ConsensusStrategy,
	type ConsensusContext,
	type ConsensusEvent,
	SECTION_RULE
} from './types';
import { NODE_LABELS, NODE_LABELS_GENERIC, type MagiNodeName } from '../types';
import { resolveNodeTemperament } from '../temperaments';
import { markCacheBreakpoint } from '../prompt-cache';
import { OPINIONATED_DIRECTIVE, missingClause } from './deliberation';
import { consensusFormat } from './format';

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
			customTemperaments,
			opinionated,
			genericLabels,
			signal,
			tier
		} = ctx;

		// Default to numbered labels; proper names only on an explicit opt-in (the
		// reveal path), so node names stay de-lored everywhere by default.
		const nodeLabels = genericLabels === false ? NODE_LABELS : NODE_LABELS_GENERIC;

		const formattedResponses = responses
			.map((r) => {
				const nodeName = nodeLabels[r.node];
				// Truthful tag: the ACTUAL temperament this node used (custom or built-in),
				// not a hard-coded guess — so the synthesizer attributes by real lens.
				const label = synthesizerAwareness
					? `${nodeName} (${r.provider}) — ${resolveNodeTemperament(r.node, customTemperaments).label}`
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
		const missing = missingClause(missingLabels, 'query');

		const assignment = nodeAssignments[consensusNodeIndex];
		const model = getModel(assignment.gateway, assignment.modelId);

		const n = responses.length;
		const countDesc =
			n === 3
				? 'Three independent AI models have each responded'
				: `${n} of three independent AI models responded`;

		const consensusNode = nodeAssignments[consensusNodeIndex].node as MagiNodeName;
		const consensusLens = consensusTemperament
			? `${resolveNodeTemperament(consensusNode, customTemperaments).prompt}${SECTION_RULE}`
			: '';

		// Truthful, dynamic awareness lens: spell out the ACTUAL persona each
		// responding node was given (custom or built-in), keyed to the same label
		// used in the response tags, so the synthesizer attributes divergence to the
		// real lens rather than guessing one.
		const lensRoster = responses
			.map((r) => {
				const t = resolveNodeTemperament(r.node, customTemperaments);
				return `- ${nodeLabels[r.node]} — ${t.label}: ${t.description}`;
			})
			.join('\n');
		const awarenessContext = synthesizerAwareness
			? `\n\nEach model answered through a distinct dispositional lens it was given as a system instruction. These are the actual lenses in play this turn:\n${lensRoster}\n\nWhen their perspectives diverge, surface WHY: attribute each position to the specific lens above that produced it. Use these exact lenses — do not invent, merge, or relabel them.`
			: '';

		const synthesisPrompt = `Original query: ${query}

The ${n === 3 ? 'three' : n} MAGI responses:

${formattedResponses}${missing}

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

Do NOT simply concatenate or summarize the responses. Produce a unified answer that is better than any individual response.${awarenessContext}${
				opinionated ? `\n\n${OPINIONATED_DIRECTIVE}` : ''
			}\n\n${consensusFormat(false)}`,
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
