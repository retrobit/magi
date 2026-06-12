import type { NodeAssignment } from './config';
import type { ConversationTurn, GatewayName, MagiNodeName, MagiResponse, TurnUsage } from './types';

/** A node that also failed last turn, carried forward unchanged during a
 *  per-node retry — same shape as the page's live model-error entries. */
export interface RetryCarriedError {
	node: MagiNodeName;
	gateway: GatewayName;
	provider: string;
	error: string;
}

/** The four lists a per-node retry needs, derived purely from the committed
 *  turn. See {@link assembleRetryPriors}. */
export interface RetryPriors {
	/** Survivor answers that succeeded last turn, rehydrated into the live turn. */
	responses: MagiResponse[];
	/** Other nodes that ALSO failed last turn — they stay failed; only the
	 *  retried node re-runs. */
	modelErrors: RetryCarriedError[];
	/** Survivor answers sent to the server (text only) so it skips them in phase 1. */
	priorResponses: { node: MagiNodeName; text: string }[];
	/** Token usage carried over for the survivors, so the refreshed turn's totals
	 *  stay intact rather than dropping the nodes that weren't re-run. */
	carriedUsage: Partial<Record<MagiNodeName, TurnUsage>>;
}

/** Pure assembly for a per-node retry: given the committed turn, the current
 *  node assignments, and the node being retried, partition the OTHER nodes into
 *  survivors (rehydrated + carried as priors) and still-failed nodes. The node
 *  being retried is omitted entirely — it reverts to pending and re-runs in
 *  phase 1. Extracted from the page component so the partitioning is unit-testable
 *  without a DOM or a live stream. */
export function assembleRetryPriors(
	last: Pick<ConversationTurn, 'nodeResponses' | 'nodeErrors' | 'nodeUsage'>,
	assignments: readonly NodeAssignment[],
	node: MagiNodeName
): RetryPriors {
	const responses: MagiResponse[] = [];
	const modelErrors: RetryCarriedError[] = [];
	const priorResponses: { node: MagiNodeName; text: string }[] = [];
	const carriedUsage: Partial<Record<MagiNodeName, TurnUsage>> = {};

	for (const a of assignments) {
		if (a.node === node) continue; // the retried node reverts to pending
		const text = last.nodeResponses[a.node];
		const errored = last.nodeErrors?.[a.node];
		if (errored) {
			modelErrors.push({ node: a.node, gateway: a.gateway, provider: a.provider, error: errored });
		} else if (text !== undefined) {
			responses.push({ node: a.node, gateway: a.gateway, provider: a.provider, text });
			priorResponses.push({ node: a.node, text });
			const usage = last.nodeUsage?.[a.node];
			if (usage) carriedUsage[a.node] = usage;
		}
	}

	return { responses, modelErrors, priorResponses, carriedUsage };
}
