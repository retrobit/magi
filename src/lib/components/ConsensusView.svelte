<script lang="ts">
	import type {
		MagiNodeName,
		GatewayName,
		ConsensusTranscriptEntry,
		ScrollMode
	} from '$lib/magi/types';
	import {
		MAGI_NODE_NAMES,
		GATEWAY_LABELS,
		NODE_LABELS,
		NODE_LABELS_GENERIC,
		NODE_TEMPERAMENTS,
		TEMPERAMENT_LABELS,
		CONSENSUS_GRADIENT,
		contextUsageClass,
		formatTokenCount,
		getProviderLabel,
		isRouter
	} from '$lib/magi/types';
	import { STRATEGY_NAMES, STRATEGY_LABELS, type StrategyName } from '$lib/magi/consensus';
	import Markdown from './Markdown.svelte';
	import TokenCount from './TokenCount.svelte';
	import { Copy, Check, LoaderCircle, CircleCheck, AlertTriangle, Brain } from 'lucide-svelte';

	let copied = $state(false);
	function copyConsensus() {
		navigator.clipboard.writeText(fullText).catch(() => {});
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	interface Props {
		text: string;
		fullText: string;
		loading: boolean;
		allModelsResponded: boolean;
		respondedCount?: number;
		erroredCount?: number;
		warning?: string;
		transcript?: ConsensusTranscriptEntry[];
		liveQuery?: string;
		liveInput?: number;
		liveOutput?: number;
		liveCached?: number;
		liveEstimated?: boolean;
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
		scrollMode?: ScrollMode;
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
		respondedCount = 0,
		erroredCount = 0,
		warning = '',
		transcript = [],
		liveQuery = '',
		liveInput = 0,
		liveOutput = 0,
		liveCached = 0,
		liveEstimated = false,
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
		scrollMode = 'follow',
		disabled = false,
		onstrategychange,
		onconsensuschange,
		onconsensustemperamentchange,
		onawarenesschange
	}: Props = $props();

	const nodeLabels = $derived(genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS);

	// Live loading-progress summary — how many of the MAGI have settled so far.
	const waitingLabel = $derived.by(() => {
		const parts = [`${respondedCount} / ${MAGI_NODE_NAMES.length} responded`];
		if (erroredCount > 0) parts.push(`${erroredCount} failed`);
		return `Waiting for MAGI — ${parts.join(', ')}…`;
	});

	const contextClass = $derived(contextUsageClass(contextUsed, contextWindow));

	// Cumulative consensus tokens: every completed turn plus the live turn.
	const totalInput = $derived(transcript.reduce((sum, t) => sum + t.inputTokens, 0) + liveInput);
	const totalOutput = $derived(transcript.reduce((sum, t) => sum + t.outputTokens, 0) + liveOutput);
	const totalCached = $derived(transcript.reduce((sum, t) => sum + t.cachedTokens, 0) + liveCached);
	const showTokens = $derived(totalInput > 0 || totalOutput > 0);
	const showContext = $derived(!!contextWindow && contextUsed > 0);

	// Follow mode: track the latest content while pinned to the bottom; a manual
	// scroll up pauses it until the viewport returns there. A ResizeObserver on
	// the content wrapper drives the follow — tracking the `text` prop would fire
	// before Markdown's throttled render grew the DOM, so every scroll chased a
	// stale height and never reached the bottom.
	let scrollEl = $state<HTMLDivElement>();
	let contentEl = $state<HTMLDivElement>();
	let pinned = $state(true);

	function onScroll() {
		if (!scrollEl) return;
		pinned = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 24;
	}

	$effect(() => {
		if (!scrollEl || !contentEl) return;
		const observer = new ResizeObserver(() => {
			if (scrollMode === 'follow' && pinned && scrollEl) {
				scrollEl.scrollTop = scrollEl.scrollHeight;
			}
		});
		observer.observe(contentEl);
		return () => observer.disconnect();
	});

	// Snap mode: once the consensus finishes, jump so the latest turn block sits
	// at the top of the panel — a clean reading start rather than the tail.
	$effect(() => {
		if (scrollMode !== 'snap' || !fullText) return;
		const el = scrollEl;
		const content = contentEl;
		if (!el || !content) return;
		const frame = requestAnimationFrame(() => {
			const block = content.lastElementChild;
			if (block) {
				el.scrollTop += block.getBoundingClientRect().top - el.getBoundingClientRect().top;
			}
		});
		return () => cancelAnimationFrame(frame);
	});

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

{#snippet tokenFooter(input: number, output: number, estimated: boolean)}
	{#if input > 0 || output > 0}
		<p class="magi-token-split text-[10px] text-gray-500">
			<TokenCount {input} {output} {estimated} total />
		</p>
	{/if}
{/snippet}

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
				{#if showTokens || showContext}
					<span class="group flex items-center gap-1 font-mono text-[10px] text-gray-500">
						{#if showTokens}
							<span
								class={showContext ? 'hidden group-hover:inline' : ''}
								title="Tokens this conversation{totalCached > 0
									? ` — ⚡${formatTokenCount(totalCached)} prompt-cached`
									: ''}"
							>
								<TokenCount
									input={totalInput}
									output={totalOutput}
									cached={totalCached}
									estimated={liveEstimated}
								/>
							</span>
						{/if}
						{#if showTokens && showContext}
							<span class="hidden opacity-50 group-hover:inline">·</span>
						{/if}
						{#if contextWindow && contextUsed > 0}
							<span
								class={contextClass}
								title="Context: {contextUsed.toLocaleString()} / {contextWindow.toLocaleString()} tokens"
								>{formatTokenCount(contextUsed)}/{formatTokenCount(contextWindow)}</span
							>
						{/if}
					</span>
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
							<option value={s}>{STRATEGY_LABELS[s]}</option>
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
	<div class="min-h-0 flex-1 overflow-y-auto" bind:this={scrollEl} onscroll={onScroll}>
		<div class="flex flex-col gap-3 p-4" bind:this={contentEl}>
			{#if transcript.length === 0 && !liveQuery}
				<p class="text-sm text-gray-600">Consensus will appear after all three MAGI respond</p>
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
						{@render tokenFooter(turn.inputTokens, turn.outputTokens, false)}
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
							<p class="animate-pulse text-sm text-gray-500">{waitingLabel}</p>
						{:else if loading && !text}
							<p class="animate-pulse text-sm text-gray-500">Synthesizing consensus...</p>
						{:else if text}
							<div class="prose prose-sm max-w-none prose-invert">
								<Markdown source={text} />
							</div>
						{:else}
							<p class="text-sm text-gray-600">
								Consensus will appear after all three MAGI respond
							</p>
						{/if}
						{@render tokenFooter(liveInput, liveOutput, liveEstimated)}
					</div>
				{/if}
			{/if}
		</div>
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
