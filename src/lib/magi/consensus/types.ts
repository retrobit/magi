import type { LanguageModel } from 'ai';
import type { MagiResponse } from '../types';

export interface ConsensusStrategy {
	name: string;
	description: string;
	execute(
		responses: MagiResponse[],
		query: string,
		model: LanguageModel
	): ReturnType<typeof import('ai').streamText>;
}

export type StrategyName = 'synthesis';
