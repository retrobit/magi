<script lang="ts">
	import type { MagiNodeName, GatewayName, ProviderName } from '$lib/magi/types';
	import {
		MAGI_NODE_NAMES,
		GATEWAY_LABELS,
		PROVIDER_LABELS,
		NODE_LABELS,
		NODE_LABELS_GENERIC,
		CONSENSUS_GRADIENT,
		isRouter
	} from '$lib/magi/types';
	import { STRATEGY_NAMES, type StrategyName } from '$lib/magi/consensus';
	import Markdown from './Markdown.svelte';
	import { Copy, LoaderCircle, CircleCheck, AlertTriangle } from 'lucide-svelte';

	const strategyLabels: Record<StrategyName, string> = {
		synthesis: 'Synthesis'
	};

	interface Props {
		text: string;
		fullText: string;
		loading: boolean;
		allModelsResponded: boolean;
		warning?: string;
		strategy: StrategyName;
		consensusNode: MagiNodeName;
		consensusGateway?: GatewayName;
		consensusProvider?: ProviderName;
		consensusModelDisplayName?: string;
		genericLabels?: boolean;
		disabled?: boolean;
		onstrategychange?: (strategy: StrategyName) => void;
		onconsensuschange?: (node: MagiNodeName) => void;
	}

	let {
		text,
		fullText,
		loading,
		allModelsResponded,
		warning = '',
		strategy,
		consensusNode,
		consensusGateway,
		consensusProvider,
		consensusModelDisplayName,
		genericLabels = false,
		disabled = false,
		onstrategychange,
		onconsensuschange
	}: Props = $props();

	const nodeLabels = $derived(genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS);

	const gradientStyle = CONSENSUS_GRADIENT;

	const synthesisLabel = $derived.by(() => {
		if (!consensusGateway || !consensusProvider || !consensusModelDisplayName) return null;
		return isRouter(consensusGateway)
			? `${GATEWAY_LABELS[consensusGateway]} — ${PROVIDER_LABELS[consensusProvider]} ${consensusModelDisplayName}`
			: `${PROVIDER_LABELS[consensusProvider]} ${consensusModelDisplayName}`;
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
	class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-gray-900 {loading &&
	allModelsResponded &&
	!text
		? 'animate-pulse'
		: ''}"
>
	<div class="h-0.5 shrink-0" style={gradientStyle}></div>
	<div class="flex shrink-0 items-center justify-between border-b border-gray-700 px-4 py-3">
		<div class="flex flex-col gap-1">
			<h3 class="text-sm font-bold text-white">MAGI CONSENSUS</h3>
			<div class="flex items-center gap-2">
				{#if onstrategychange}
					<span class="text-xs text-gray-500">Strategy</span>
					<select
						class="rounded bg-gray-800 py-0.5 pr-6 pl-2 text-xs text-gray-300 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
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
						class="rounded bg-gray-800 py-0.5 pr-6 pl-2 text-xs text-gray-300 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
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
		</div>
		{#if loading && !allModelsResponded}
			<div class="h-2 w-2 rounded-full bg-gray-600"></div>
		{:else if loading}
			<LoaderCircle size={14} class="animate-spin text-yellow-400" />
		{:else if text}
			<div class="flex items-center gap-2">
				{#if fullText}
					<button
						class="text-gray-400 transition-colors hover:text-white"
						onclick={() => navigator.clipboard.writeText(fullText).catch(() => {})}
						title="Copy consensus"
					>
						<Copy size={14} />
					</button>
				{/if}
				<CircleCheck size={14} class="text-green-400" />
			</div>
		{/if}
	</div>
	<div class="prose prose-sm min-h-0 max-w-none flex-1 overflow-y-auto p-4 prose-invert">
		{#if warning}
			<p class="flex items-center gap-1.5 text-sm text-amber-400">
				<AlertTriangle size={14} />
				{warning}
			</p>
		{/if}
		{#if loading && !allModelsResponded}
			<p class="text-gray-500">Waiting for MAGI responses...</p>
		{:else if loading && !text}
			<p class="animate-pulse text-gray-500">Synthesizing consensus...</p>
		{:else if text}
			<Markdown source={text} />
		{:else}
			<p class="text-gray-600">Consensus will appear after all three MAGI respond.</p>
		{/if}
	</div>
</div>
