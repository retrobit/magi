import { synthesisStrategy } from './synthesis';
import { votingStrategy } from './voting';
import { debateStrategy } from './debate';
import type { ConsensusStrategy, StrategyName } from './types';

/** `none` skips the consensus phase entirely and isn't a dispatchable strategy
 *  — the server short-circuits before calling `getStrategy`, so this dispatch
 *  table only carries the strategies that actually have a runner. */
export type DispatchableStrategy = Exclude<StrategyName, 'none'>;

const strategies: Record<DispatchableStrategy, ConsensusStrategy> = {
	synthesis: synthesisStrategy,
	voting: votingStrategy,
	debate: debateStrategy
};

export function getStrategy(name: DispatchableStrategy): ConsensusStrategy {
	return strategies[name];
}

export {
	STRATEGY_NAMES,
	STRATEGY_LABELS,
	STRATEGY_DESCRIPTIONS,
	STRATEGY_INTENSITY,
	FLAGSHIP_STRATEGY,
	DEFAULT_STRATEGY,
	type ConsensusStrategy,
	type StrategyName,
	type ConsensusEvent,
	type ConsensusContext
} from './types';
