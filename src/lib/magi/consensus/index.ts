import { synthesisStrategy } from './synthesis';
import type { ConsensusStrategy, StrategyName } from './types';

const strategies: Record<StrategyName, ConsensusStrategy> = {
	synthesis: synthesisStrategy
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
	DEFAULT_STRATEGY,
	type ConsensusStrategy,
	type StrategyName,
	type ConsensusEvent,
	type ConsensusContext
} from './types';
