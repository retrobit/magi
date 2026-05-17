<script lang="ts">
	import type { MagiNodeName, GatewayName } from '$lib/magi/types';
	import {
		MAGI_NODE_NAMES,
		GATEWAY_LABELS,
		NODE_LABELS,
		NODE_LABELS_GENERIC,
		NODE_TEMPERAMENTS,
		TEMPERAMENT_LABELS,
		CONSENSUS_GRADIENT,
		formatTokenCount,
		getProviderLabel,
		isRouter
	} from '$lib/magi/types';
	import { STRATEGY_NAMES, type StrategyName } from '$lib/magi/consensus';
	import Markdown from './Markdown.svelte';
	import { Copy, Check, LoaderCircle, CircleCheck, AlertTriangle, Brain } from 'lucide-svelte';

	let copied = $state(false);
	function copyConsensus() {
		navigator.clipboard.writeText(fullText).catch(() => {});
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const strategyLabels: Record<StrategyName, string> = {
		synthesis: 'Synthesis'
	};

	interface Props {
		text: string;
		fullText: string;
		loading: boolean;
		allModelsResponded: boolean;
		warning?: string;
		transcript?: {
			query: string;
			consensus: string;
			inputTokens: number;
			outputTokens: number;
		}[];
		liveQuery?: string;
		liveInput?: number;
		liveOutput?: number;
		contextUsed?: number;
		contextWindow?: number;
		strategy: StrategyName;
		consensusNode: MagiNodeName;
		consensusGateway?: GatewayName;
		consensusProvider?: string;
		consensusModelDisplayName?: string;
		consensusTemperament?: boolean;
		temperamentAwareness?: boolean;
		genericLabels?: boolean;
		disabled?: boolean;
		onstrategychange?: (strategy: StrategyName) => void;
		onconsensuschange?: (node: MagiNodeName) => void;
		onconsensustemperamentchange?: (value: boolean) => void;
		onawarenesschange?: (value: boolean) => void;
	}

	let {
		text,
		fullText,
		loading,
		allModelsResponded,
		warning = '',
		transcript = [],
		liveQuery = '',
		liveInput = 0,
		liveOutput = 0,
		contextUsed = 0,
		contextWindow,
		strategy,
		consensusNode,
		consensusGateway,
		consensusProvider,
		consensusModelDisplayName,
		consensusTemperament = false,
		temperamentAwareness = false,
		genericLabels = false,
		disabled = false,
		onstrategychange,
		onconsensuschange,
		onconsensustemperamentchange,
		onawarenesschange
	}: Props = $props();

	const nodeLabels = $derived(genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS);

	const contextRatio = $derived(contextWindow ? contextUsed / contextWindow : 0);
	const contextClass = $derived(
		contextRatio >= 0.9 ? 'text-red-400' : contextRatio >= 0.75 ? 'text-amber-400' : 'text-gray-500'
	);

	const gradientStyle = CONSENSUS_GRADIENT;

	const synthesisLabel = $derived.by(() => {
		if (!consensusGateway || !consensusProvider || !consensusModelDisplayName) return null;
		return isRouter(consensusGateway)
			? `${GATEWAY_LABELS[consensusGateway]} — ${getProviderLabel(consensusProvider)} ${consensusModelDisplayName}`
			: `${getProviderLabel(consensusProvider)} ${consensusModelDisplayName}`;
	});

	function handleStrategyChange(e: Event) {
		const s = (e.target as HTMLSelectElement).value as StrategyName;
		onstrategychange?.(s);
	}

	function handleNodeChange(e: Event) {
		const node = (e.target as HTMLSelectElement).value as MagiNodeName;
		onconsensuschange?.(node);
	}
</script>

<div
	class="magi-panel flex h-full max-h-[70vh] min-h-72 flex-col overflow-hidden rounded-lg bg-gray-900/70 md:max-h-none {loading &&
	allModelsResponded
		? 'pulse-consensus'
		: ''}"
>
	<div class="h-0.5 shrink-0" style={gradientStyle}></div>
	<div class="flex shrink-0 flex-col gap-2 border-b border-gray-700 px-4 py-3">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<h3 class="text-sm font-bold text-white">MAGI CONSENSUS</h3>
				{#if consensusTemperament}
					<span
						class="magi-temperament-badge rounded bg-gray-600/30 px-1.5 py-0.5 text-[10px] font-medium text-gray-300 ring-1 ring-gray-500/30"
						>{TEMPERAMENT_LABELS[NODE_TEMPERAMENTS[consensusNode]]}</span
					>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if contextWindow && contextUsed > 0}
					<span
						class="text-[10px] {contextClass}"
						title="Context: {contextUsed.toLocaleString()} / {contextWindow.toLocaleString()} tokens"
						>{formatTokenCount(contextUsed)}/{formatTokenCount(contextWindow)}</span
					>
				{/if}
				{#if loading && !allModelsResponded}
					<div class="h-2 w-2 rounded-full bg-gray-600"></div>
				{:else if loading}
					<LoaderCircle size={14} class="animate-spin text-yellow-400" />
				{:else if text}
					<div class="flex items-center gap-2">
						{#if fullText}
							<button
								class="text-gray-400 transition-colors hover:text-white"
								onclick={copyConsensus}
								title="Copy consensus"
							>
								{#if copied}
									<Check size={14} class="text-green-400" />
								{:else}
									<Copy size={14} />
								{/if}
							</button>
						{/if}
						<CircleCheck size={14} class="text-green-400" />
					</div>
				{:else}
					<div class="h-2 w-2 rounded-full bg-gray-600"></div>
				{/if}
			</div>
		</div>
		<div class="border-t border-gray-700"></div>
		<div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
				{#if onstrategychange}
					<span class="text-xs text-gray-500">Strategy</span>
					<select
						class="magi-select rounded bg-gray-800 py-0.5 pr-6 pl-2 text-xs text-gray-300 focus:ring-1 focus:ring-gray-500 focus:outline-none"
						value={strategy}
						onchange={handleStrategyChange}
						{disabled}
					>
						{#each STRATEGY_NAMES as s (s)}
							<option value={s}>{strategyLabels[s]}</option>
						{/each}
					</select>
					<span class="text-xs text-gray-700">·</span>
				{/if}
				{#if onconsensuschange}
					<span class="text-xs text-gray-500">Node</span>
					<select
						class="magi-select rounded bg-gray-800 py-0.5 pr-6 pl-2 text-xs text-gray-300 focus:ring-1 focus:ring-gray-500 focus:outline-none"
						value={consensusNode}
						onchange={handleNodeChange}
						{disabled}
					>
						{#each MAGI_NODE_NAMES as node (node)}
							<option value={node}>{nodeLabels[node]}</option>
						{/each}
					</select>
				{/if}
				{#if synthesisLabel}
					<span class="text-xs text-gray-400">{synthesisLabel}</span>
				{/if}
			</div>
			{#if onconsensustemperamentchange || onawarenesschange}
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-xs text-gray-500">Temperament</span>
					{#if onconsensustemperamentchange}
						<button
							type="button"
							class="magi-temperament-toggle flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors {consensusTemperament
								? 'magi-temperament-toggle-on bg-gray-600/30 text-gray-200 ring-1 ring-gray-500/50'
								: 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'}"
							onclick={() => onconsensustemperamentchange(!consensusTemperament)}
							{disabled}
							title={consensusTemperament
								? 'Consensus temperament active — synthesizer responds through its dispositional lens'
								: 'Enable consensus temperament — give the synthesizer its own dispositional personality'}
						>
							<Brain size={12} />
							{consensusTemperament ? 'ON' : 'OFF'}
						</button>
					{/if}
					{#if onawarenesschange}
						<button
							type="button"
							class="magi-temperament-toggle flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors {temperamentAwareness
								? 'magi-temperament-toggle-on bg-gray-600/30 text-gray-200 ring-1 ring-gray-500/50'
								: 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'}"
							onclick={() => onawarenesschange(!temperamentAwareness)}
							{disabled}
							title={temperamentAwareness
								? 'Temperament awareness active — synthesizer considers dispositional lenses'
								: "Enable temperament awareness — tell the synthesizer about each node's dispositional lens"}
						>
							<Brain size={12} />
							Awareness {temperamentAwareness ? 'ON' : 'OFF'}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
	<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
		{#if transcript.length === 0 && !liveQuery}
			<p class="text-sm text-gray-600">Consensus will appear after all three MAGI respond.</p>
		{:else}
			{#each transcript as turn, i (i)}
				<div
					class="flex flex-col gap-1.5 {i > 0
						? 'magi-turn-divider border-t border-gray-800 pt-3'
						: ''}"
				>
					<p class="text-xs font-medium text-gray-500">{turn.query}</p>
					{#if turn.consensus}
						<div class="prose prose-sm max-w-none prose-invert">
							<Markdown source={turn.consensus} />
						</div>
					{:else}
						<p class="text-sm text-gray-600">No consensus</p>
					{/if}
					{#if turn.inputTokens > 0 || turn.outputTokens > 0}
						<p class="magi-token-split text-[10px] text-gray-400">
							↑{turn.inputTokens.toLocaleString()} ↓{turn.outputTokens.toLocaleString()}
						</p>
					{/if}
				</div>
			{/each}
			{#if liveQuery}
				<div
					class="flex flex-col gap-1.5 {transcript.length > 0
						? 'magi-turn-divider border-t border-gray-800 pt-3'
						: ''}"
				>
					<p class="text-xs font-medium text-gray-500">{liveQuery}</p>
					{#if warning}
						<p class="flex items-center gap-1.5 text-sm text-amber-400">
							<AlertTriangle size={14} />
							{warning}
						</p>
					{/if}
					{#if loading && !allModelsResponded}
						<p class="text-sm text-gray-500">Waiting for MAGI responses...</p>
					{:else if loading && !text}
						<p class="animate-pulse text-sm text-gray-500">Synthesizing consensus...</p>
					{:else if text}
						<div class="prose prose-sm max-w-none prose-invert">
							<Markdown source={text} />
						</div>
					{:else}
						<p class="text-sm text-gray-600">Consensus will appear after all three MAGI respond.</p>
					{/if}
					{#if liveInput > 0 || liveOutput > 0}
						<p class="magi-token-split text-[10px] text-gray-400">
							↑{liveInput.toLocaleString()} ↓{liveOutput.toLocaleString()}
						</p>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	@keyframes pulse-consensus {
		0%,
		100% {
			box-shadow: inset 0 0 0 0 transparent;
			opacity: 0.7;
		}
		50% {
			box-shadow:
				inset 15px 0 15px -10px #ef4444,
				inset -15px 0 15px -10px #3b82f6;
			opacity: 1;
		}
	}

	@keyframes pulse-top-glow {
		0%,
		100% {
			opacity: 0;
		}
		50% {
			opacity: 0.5;
		}
	}

	.pulse-consensus {
		position: relative;
		animation: pulse-consensus 2s ease-in-out infinite;
	}

	.pulse-consensus::before {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 6px;
		background: linear-gradient(to right, #ef4444, #34d399, #3b82f6);
		filter: blur(6px);
		pointer-events: none;
		animation: pulse-top-glow 2s ease-in-out infinite;
	}

	.pulse-consensus::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 6px;
		background: linear-gradient(to right, #ef4444, #34d399, #3b82f6);
		filter: blur(6px);
		pointer-events: none;
		animation: pulse-top-glow 2s ease-in-out infinite;
	}
</style>
