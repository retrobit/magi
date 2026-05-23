// Playful rotating loading verbs, à la Claude Code — shown beside the spinner
// while a node waits for its first token, or while the consensus is being
// produced. Node lists lean into each temperament; the consensus list leans
// into the active strategy. Purely cosmetic flavor.

import type { TemperamentName } from './types';
import type { StrategyName } from './consensus/types';

// Used when temperaments are off (no dispositional lens to flavor the verbs).
export const GENERIC_VERBS = ['Thinking', 'Pondering', 'Reasoning', 'Considering', 'Mulling'];

export const TEMPERAMENT_VERBS: Record<TemperamentName, string[]> = {
	rationalist: ['Calculating', 'Analyzing', 'Deducing', 'Weighing the data', 'Cross-checking'],
	caretaker: ['Considering', 'Empathizing', 'Weighing the impact', 'Reflecting', 'Caring'],
	individualist: ['Pondering', 'Feeling it out', 'Imagining', 'Following a hunch', 'Riffing']
};

export const STRATEGY_VERBS: Record<StrategyName, string[]> = {
	synthesis: ['Synthesizing', 'Reconciling', 'Weighing', 'Distilling', 'Composing'],
	voting: ['Tallying', 'Scoring', 'Counting', 'Deliberating', 'Judging']
};
