import type { LanguageModel } from 'ai';
import type { MagiResponse, GatewayName } from '../types';
import type { NodeAssignment } from '../config';

export type ConsensusEvent =
	| { type: 'text-delta'; text: string }
	| { type: 'complete'; fullText: string };

export interface ConsensusContext {
	responses: MagiResponse[];
	query: string;
	getModel: (gateway: GatewayName, modelId: string) => LanguageModel;
	nodeAssignments: readonly NodeAssignment[];
	consensusNodeIndex: number;
	consensusTemperament?: boolean;
	temperaments?: boolean;
	genericLabels?: boolean;
	signal?: AbortSignal;
}

export interface ConsensusStrategy {
	name: string;
	description: string;
	execute(ctx: ConsensusContext): AsyncIterable<ConsensusEvent>;
}

export const STRATEGY_NAMES = ['synthesis'] as const;
export type StrategyName = (typeof STRATEGY_NAMES)[number];
export const DEFAULT_STRATEGY: StrategyName = 'synthesis';
