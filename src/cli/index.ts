#!/usr/bin/env bun

import { parseArgs } from 'util';
import { streamText } from 'ai';
import { getModel, TIERS } from '../lib/magi/models';
import { getStrategy } from '../lib/magi/consensus';
import { MAGI_NODES } from '../lib/magi/types';
import type { TierName, MagiResponse } from '../lib/magi/types';
import type { StrategyName } from '../lib/magi/consensus';

// ANSI colors
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const orange = (s: string) => `\x1b[38;5;208m${s}\x1b[0m`;
const green = (s: string) => `\x1b[38;5;34m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[38;5;39m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[38;5;135m${s}\x1b[0m`;

const NODE_COLORS: Record<string, (s: string) => string> = {
	MELCHIOR: orange,
	BALTHASAR: green,
	CASPAR: blue
};

const TIER_NAMES: TierName[] = ['free', 'frontier', 'balanced', 'budget'];
const STRATEGY_NAMES: StrategyName[] = ['synthesis'];

const { values, positionals } = parseArgs({
	args: process.argv.slice(2),
	options: {
		tier: { type: 'string', short: 't', default: 'free' },
		strategy: { type: 'string', short: 's', default: 'synthesis' },
		help: { type: 'boolean', short: 'h', default: false }
	},
	allowPositionals: true
});

if (values.help || positionals.length === 0) {
	console.log(`
${bold('MAGI')} — Three AI models. One consensus.

${bold('Usage:')}
  magi [options] <query>

${bold('Options:')}
  -t, --tier <tier>          Model tier: ${TIER_NAMES.join(', ')} ${dim('(default: free)')}
  -s, --strategy <strategy>  Consensus strategy: ${STRATEGY_NAMES.join(', ')} ${dim('(default: synthesis)')}
  -h, --help                 Show this help message

${bold('Examples:')}
  magi "What is consciousness?"
  magi -t frontier "Explain quantum entanglement"
  magi --tier budget "Summarize the news"
`);
	process.exit(0);
}

const query = positionals.join(' ');
const tier = values.tier as TierName;
const strategyName = values.strategy as StrategyName;

if (!TIER_NAMES.includes(tier)) {
	console.error(`Unknown tier: ${tier}. Choose from: ${TIER_NAMES.join(', ')}`);
	process.exit(1);
}

if (!STRATEGY_NAMES.includes(strategyName)) {
	console.error(`Unknown strategy: ${strategyName}. Choose from: ${STRATEGY_NAMES.join(', ')}`);
	process.exit(1);
}

// Header
console.log();
console.log(`${bold('MAGI System')} ${dim('—')} ${tier} tier ${dim('—')} ${strategyName} consensus`);
console.log();

// Phase 1: Dispatch to all three MAGI nodes in parallel
const red = (s: string) => `\x1b[38;5;196m${s}\x1b[0m`;

const magiResults = await Promise.allSettled(
	MAGI_NODES.map(async (node) => {
		const model = getModel(node.provider, tier);
		const modelId = TIERS[tier][node.provider];

		const result = await streamText({ model, prompt: query });
		const text = await result.text;

		return { node, text, modelId } as MagiResponse & { modelId: string };
	})
);

// Display results
const responses: MagiResponse[] = [];

for (let i = 0; i < MAGI_NODES.length; i++) {
	const node = MAGI_NODES[i];
	const modelId = TIERS[tier][node.provider];
	const color = NODE_COLORS[node.name];
	const label = `${color(bold(node.name))} ${dim(`(${node.provider} · ${modelId})`)}`;
	const result = magiResults[i];

	console.log(`── ${label} ${'─'.repeat(Math.max(0, 52 - node.name.length - node.provider.length - modelId.length))}`);
	console.log();

	if (result.status === 'fulfilled') {
		console.log(result.value.text);
		responses.push({ node: result.value.node, text: result.value.text });
	} else {
		const msg = result.reason?.message ?? String(result.reason);
		console.log(red(`Error: ${msg}`));
	}
	console.log();
}

if (responses.length === 0) {
	console.error(red('All models failed. Cannot generate consensus.'));
	process.exit(1);
}

// Phase 2: Run consensus strategy
const consensusStrategy = getStrategy(strategyName);
const consensusModel = getModel('anthropic', tier);

console.log(`── ${magenta(bold('CONSENSUS'))} ${dim(`(${strategyName})`)} ${'─'.repeat(40)}`);
console.log();

const consensusResult = consensusStrategy.execute(responses, query, consensusModel);

for await (const chunk of consensusResult.textStream) {
	process.stdout.write(chunk);
}

console.log();
console.log();
