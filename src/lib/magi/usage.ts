import { MAGI_NODE_NAMES, type ConversationTurn, type MagiNodeName } from './types';

// Token math over committed turns only. The page layers the in-flight turn's live
// usage on top, so these stay pure functions of the saved conversation.

/** Summed prompt / generated tokens across every node and consensus call of every committed turn. */
export function committedUsage(conversation: ConversationTurn[]): {
	input: number;
	output: number;
} {
	let input = 0;
	let output = 0;
	for (const turn of conversation) {
		for (const node of MAGI_NODE_NAMES) {
			const u = turn.nodeUsage[node];
			if (u) {
				input += u.inputTokens;
				output += u.outputTokens;
			}
		}
		if (turn.consensusUsage) {
			input += turn.consensusUsage.inputTokens;
			output += turn.consensusUsage.outputTokens;
		}
	}
	return { input, output };
}

/** Prompt size of the node's most recent committed call (0 when it has none). */
export function latestCommittedNodeInput(
	conversation: ConversationTurn[],
	node: MagiNodeName
): number {
	for (let i = conversation.length - 1; i >= 0; i--) {
		const u = conversation[i].nodeUsage[node];
		if (u) return u.inputTokens;
	}
	return 0;
}

/** Prompt size of the most recent committed consensus call (0 when there is none). */
export function latestCommittedConsensusInput(conversation: ConversationTurn[]): number {
	for (let i = conversation.length - 1; i >= 0; i--) {
		const u = conversation[i].consensusUsage;
		if (u) return u.inputTokens;
	}
	return 0;
}
