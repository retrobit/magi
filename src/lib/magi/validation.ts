import { z } from 'zod';
import { TIER_NAMES, MAGI_NODE_NAMES } from './types';
import { STRATEGY_NAMES } from './consensus/types';

export const magiRequestSchema = z.object({
	query: z.string().min(1, 'Query must not be empty').max(10_000, 'Query too long'),
	tier: z.enum(TIER_NAMES),
	strategy: z.enum(STRATEGY_NAMES),
	consensusNode: z.enum(MAGI_NODE_NAMES).optional()
});

export type MagiRequest = z.infer<typeof magiRequestSchema>;
