import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { streamText } from 'ai';
import { getModel } from '$lib/magi/models';
import { getStrategy } from '$lib/magi/consensus';
import { MAGI_NODES } from '$lib/magi/types';
import type { TierName, MagiResponse } from '$lib/magi/types';
import type { StrategyName } from '$lib/magi/consensus';

export const POST: RequestHandler = async ({ request }) => {
	const { query, tier, strategy: strategyName } = (await request.json()) as {
		query: string;
		tier: TierName;
		strategy: StrategyName;
	};

	// Phase 1: Dispatch to all three MAGI nodes in parallel
	const magiPromises = MAGI_NODES.map(async (node) => {
		const model = getModel(node.provider, tier);
		const result = await streamText({
			model,
			prompt: query
		});
		const text = await result.text;
		return { node, text } satisfies MagiResponse;
	});

	const responses = await Promise.all(magiPromises);

	// Phase 2: Run consensus strategy
	const consensusStrategy = getStrategy(strategyName);
	const consensusModel = getModel('anthropic', tier);
	const consensusResult = consensusStrategy.execute(responses, query, consensusModel);
	const consensusText = await (await consensusResult).text;

	return json({
		responses: responses.map((r) => ({
			node: r.node,
			text: r.text
		})),
		consensus: consensusText
	});
};
