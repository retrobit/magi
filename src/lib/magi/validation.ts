import { z } from 'zod';
import { TIER_NAMES, MAGI_NODE_NAMES, GATEWAY_NAMES } from './types';
import { STRATEGY_NAMES } from './consensus/types';

export const nodeAssignmentSchema = z.object({
	node: z.enum(MAGI_NODE_NAMES),
	gateway: z.enum(GATEWAY_NAMES),
	provider: z.string().min(1),
	modelId: z.string().min(1)
});

// One completed conversation turn, replayed as context for the next turn.
const historyTurnSchema = z.object({
	query: z.string().min(1).max(10_000),
	nodeResponses: z.array(
		z.object({
			node: z.enum(MAGI_NODE_NAMES),
			text: z.string().max(50_000)
		})
	),
	consensus: z.string().max(50_000)
});

export const magiRequestSchema = z.object({
	query: z.string().min(1, 'Query must not be empty').max(10_000, 'Query too long'),
	tier: z.enum(TIER_NAMES),
	strategy: z.enum(STRATEGY_NAMES),
	consensusNode: z.enum(MAGI_NODE_NAMES).optional(),
	assignments: z
		.tuple([nodeAssignmentSchema, nodeAssignmentSchema, nodeAssignmentSchema])
		.optional(),
	temperaments: z.boolean().optional(),
	consensusTemperament: z.boolean().optional(),
	temperamentAwareness: z.boolean().optional(),
	genericLabels: z.boolean().optional(),
	history: z.array(historyTurnSchema).max(50).optional()
});

export type MagiRequest = z.infer<typeof magiRequestSchema>;
export type HistoryTurn = z.infer<typeof historyTurnSchema>;
