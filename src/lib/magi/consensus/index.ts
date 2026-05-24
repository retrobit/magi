import { synthesisStrategy } from './synthesis';
import { votingStrategy } from './voting';
import { debateStrategy } from './debate';
import type { ConsensusStrategy, StrategyName } from './types';

const strategies: Record<StrategyName, ConsensusStrategy> = {
	synthesis: synthesisStrategy,
	voting: votingStrategy,
	debate: debateStrategy
};

export function getStrategy(name: StrategyName): ConsensusStrategy {
	return strategies[name];
}

export function getAvailableStrategies(): { name: StrategyName; description: string }[] {
	return Object.entries(strategies).map(([name, strategy]) => ({
		name: name as StrategyName,
		description: strategy.description
	}));
}

export {
	STRATEGY_NAMES,
	STRATEGY_LABELS,
	STRATEGY_DESCRIPTIONS,
	STRATEGY_PENDING_LABELS,
	STRATEGY_INTENSITY,
	FLAGSHIP_STRATEGY,
	DEFAULT_STRATEGY,
	type ConsensusStrategy,
	type StrategyName,
	type ConsensusEvent,
	type ConsensusContext
} from './types';
