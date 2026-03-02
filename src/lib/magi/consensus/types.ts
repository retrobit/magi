import type { LanguageModel } from 'ai';
import type { MagiResponse, ProviderName, TierName } from '../types';

export type ConsensusEvent =
	| { type: 'text-delta'; text: string }
	| { type: 'complete'; fullText: string };

export interface ConsensusContext {
	responses: MagiResponse[];
	query: string;
	getModel: (provider: ProviderName, tier: TierName) => LanguageModel;
	tier: TierName;
	consensusProvider: ProviderName;
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
