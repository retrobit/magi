<script lang="ts">
	import type {
		MagiNodeName,
		GatewayName,
		TemperamentName,
		AvailableModel,
		NodeTranscriptEntry,
		DebateRoundEntry,
		ScrollMode
	} from '$lib/magi/types';
	import {
		GATEWAY_LABELS,
		NODE_COLOR_VARS,
		NODE_LABELS,
		NODE_LABELS_GENERIC,
		TEMPERAMENT_LABELS,
		TEMPERAMENT_TOOLTIPS,
		contextUsageClass,
		formatTokenCount,
		tokenUsageTooltip,
		getProviderLabel,
		isRouter
	} from '$lib/magi/types';
	import {
		GENERIC_VERBS,
		TEMPERAMENT_VERBS,
		SWEEP_MS,
		sweepVerb,
		sweepCycleLength
	} from '$lib/magi/loading-verbs';
	import { tooltip } from '$lib/actions/tooltip';
	import { stripSummaryTail } from '$lib/magi/consensus/debate';
	import Markdown from './Markdown.svelte';
	import TokenCount from './TokenCount.svelte';
	import CopyScopeButton from './CopyScopeButton.svelte';
	import {
		Shuffle,
		CircleAlert,
		LoaderCircle,
		CircleCheck,
		CircleHelp,
		ChevronRight,
		X
	} from 'lucide-svelte';

	interface Props {
		name: MagiNodeName;
		models: AvailableModel[];
		gateway: GatewayName | '';
		provider: string;
		modelId: string;
		modelDisplayName: string;
		text: string;
		error: string;
		status: 'idle' | 'pending' | 'success' | 'error' | 'unknown';
		/** Live debate rounds for this node (Multi-Round Debate only). */
		debateRounds?: DebateRoundEntry[];
		/** Collapsed to just the header (focus accordion). */
		collapsed?: boolean;
		transcript?: NodeTranscriptEntry[];
		liveQuery?: string;
		liveInput?: number;
		liveOutput?: number;
		liveCached?: number;
		liveEstimated?: boolean;
		contextUsed?: number;
		contextWindow?: number;
		temperament?: TemperamentName;
		genericLabels?: boolean;
		scrollMode?: ScrollMode;
		disabled?: boolean;
		usedProviders?: string[];
		onchange?: (gateway: GatewayName, provider: string, modelId: string) => void;
		onlabelclick?: () => void;
		/** Clicking the header strip (outside any control) fires this — the page
		 *  uses it to toggle the focus accordion between balanced and nodes-expanded. */
		onheadertoggle?: () => void;
	}

	let {
		name,
		models,
		gateway,
		provider,
		modelId,
		modelDisplayName,
		text,
		error,
		status,
		debateRounds = [],
		collapsed = false,
		transcript = [],
		liveQuery = '',
		liveInput = 0,
		liveOutput = 0,
		liveCached = 0,
		liveEstimated = false,
		contextUsed = 0,
		contextWindow,
		temperament,
		genericLabels = false,
		scrollMode = 'follow',
		disabled = false,
		usedProviders = [],
		onchange,
		onlabelclick,
		onheadertoggle
	}: Props = $props();

	// Fire `onheadertoggle` for clicks that land on the header strip itself
	// (not on a button/select/anchor child). Same handler covers the keyboard
	// path so the strip is keyboard-operable when a callback is wired.
	function isControlClick(e: Event): boolean {
		const t = e.target;
		return t instanceof HTMLElement && !!t.closest('button, select, a, input, textarea');
	}
	function onHeaderRowClick(e: MouseEvent) {
		if (!onheadertoggle || isControlClick(e)) return;
		onheadertoggle();
	}
	function onHeaderRowKeydown(e: KeyboardEvent) {
		if (!onheadertoggle) return;
		if (e.target !== e.currentTarget) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onheadertoggle();
		}
	}

	const displayLabel = $derived(genericLabels ? NODE_LABELS_GENERIC[name] : NODE_LABELS[name]);

	// The latest entry that has actual content for this node. Used to fall back
	// to the transcript after live state resets at turn commit.
	const lastEntry = $derived([...transcript].reverse().find((t) => t.response));
	// Final response — falls back to the most recent transcript entry once the
	// live state is cleared.
	const copyTarget = $derived(text || lastEntry?.response || '');
	// Original query for the current/most-recent turn.
	const copyQuery = $derived(liveQuery || lastEntry?.query || '');
	// Debate rounds for the current/most-recent turn (live state holds them
	// while a turn is in flight; transcript holds them after commit).
	const copyRounds = $derived<DebateRoundEntry[]>(
		debateRounds.length > 0 ? debateRounds : (lastEntry?.debateRounds ?? [])
	);

	function formatRoundsBlock(rounds: DebateRoundEntry[]): string {
		return rounds.map((r) => `Round ${r.round}:\n${r.response}`).join('\n\n');
	}
	// Materialized scope contents. Empty strings disable the corresponding
	// option in the dropdown menu.
	const copyScopes = $derived.by(() => {
		const final = copyTarget;
		const query = copyQuery;
		const rounds = copyRounds;
		const haveRounds = rounds.length > 0;
		const queryAndFinal = query && final ? `Query:\n${query}\n\nFinal response:\n${final}` : '';
		const finalAndRounds =
			haveRounds && final ? `${formatRoundsBlock(rounds)}\n\nFinal response:\n${final}` : '';
		const everything =
			haveRounds && query && final
				? `Query:\n${query}\n\n${formatRoundsBlock(rounds)}\n\nFinal response:\n${final}`
				: '';
		return [
			{ id: 'final', label: 'Final response', content: final },
			{ id: 'queryFinal', label: 'Query + final', content: queryAndFinal },
			...(haveRounds
				? [
						{ id: 'finalRounds', label: 'Final + rounds', content: finalAndRounds },
						{ id: 'everything', label: 'Everything', content: everything }
					]
				: [])
		];
	});

	const contextClass = $derived(contextUsageClass(contextUsed, contextWindow));

	// Once a conversation starts, the three-select stack collapses to a one-line
	// chip so responses own the panel; the chip re-expands it on demand. Idle
	// panels keep the full stack — picking models IS the idle activity.
	const inConversation = $derived(transcript.length > 0 || !!liveQuery);
	let configExpanded = $state(false);
	const chipLabel = $derived.by(() => {
		if (!gateway) return 'Not configured';
		const parts: string[] = [GATEWAY_LABELS[gateway as GatewayName]];
		if (showRouterProvider && provider) parts.push(getProviderLabel(provider));
		if (modelDisplayName) parts.push(modelDisplayName);
		return parts.join(' · ');
	});

	// Cumulative tokens for this node: every completed turn plus the live turn.
	const totalInput = $derived(transcript.reduce((sum, t) => sum + t.inputTokens, 0) + liveInput);
	const totalOutput = $derived(transcript.reduce((sum, t) => sum + t.outputTokens, 0) + liveOutput);
	const totalCached = $derived(transcript.reduce((sum, t) => sum + t.cachedTokens, 0) + liveCached);
	const showTokens = $derived(totalInput > 0 || totalOutput > 0);
	const showContext = $derived(!!contextWindow && contextUsed > 0);

	// Breakdown for the static-width gauge's hover tooltip — kept off the gauge
	// itself so hovering never widens the header and shoves the layout control.
	const tokensTooltip = $derived(
		tokenUsageTooltip({ contextUsed, contextWindow, totalInput, totalOutput, totalCached })
	);

	// Follow mode: track the latest content while pinned to the bottom; a manual
	// scroll up pauses it until the viewport returns there. A ResizeObserver on
	// the content wrapper drives the follow — tracking the `text` prop would fire
	// before Markdown's throttled render grew the DOM, so every scroll chased a
	// stale height and never reached the bottom.
	let scrollEl = $state<HTMLDivElement>();
	let contentEl = $state<HTMLDivElement>();
	let pinned = $state(true);
	// Scroll-viewport height — used to give the latest turn block a min-height in
	// snap mode so its prompt can always reach the top, even when the response is
	// shorter than the panel.
	let viewportH = $state(0);
	const snapMinHeight = $derived(scrollMode === 'snap' ? `${viewportH}px` : undefined);

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

	// Snap mode: the moment a new turn is submitted (liveQuery appears), jump so
	// the new turn block sits at the top of the panel — the blank line above the
	// prompt lands at the very top, and the response then streams in below it.
	// Triggering on submit (not on completion) means the reader's eye is parked
	// at the new prompt before any tokens arrive.
	$effect(() => {
		if (scrollMode !== 'snap' || !liveQuery) return;
		const el = scrollEl;
		const content = contentEl;
		if (!el || !content) return;
		const frame = requestAnimationFrame(() => {
			// Target the prompt line (first child), not the block, so the divider
			// and its padding scroll off above. Leave a few px of breathing room
			// above the prompt rather than pinning it flush to the top edge.
			const block = content.lastElementChild;
			const target = block?.firstElementChild ?? block;
			if (target) {
				el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - 8;
			}
		});
		return () => cancelAnimationFrame(frame);
	});

	// Snap mode: each new debate round is a fresh sub-response, so jump to the
	// latest round card the moment it lands. Tied to the node-round count (the
	// per-round events) rather than liveQuery, which only changes on submit.
	$effect(() => {
		const count = debateRounds.length;
		if (scrollMode !== 'snap' || count === 0) return;
		const el = scrollEl;
		const content = contentEl;
		if (!el || !content) return;
		const frame = requestAnimationFrame(() => {
			const rounds = content.querySelectorAll('.magi-round');
			const target = rounds[rounds.length - 1];
			if (target) {
				el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - 8;
			}
		});
		return () => cancelAnimationFrame(frame);
	});

	// Loading indicator while the node waits for its first token: a block sweeps
	// through the verb left-to-right, then the next verb sweeps. The verb list
	// leans into the node's temperament when one is set, else a neutral set.
	const loadingVerbs = $derived(temperament ? TEMPERAMENT_VERBS[temperament] : GENERIC_VERBS);
	let verbIndex = $state(0);
	let sweep = $state(0);
	const loadingText = $derived(sweepVerb(loadingVerbs[verbIndex % loadingVerbs.length], sweep));
	$effect(() => {
		if (status !== 'pending' || text) return;
		verbIndex = 0;
		sweep = 0;
		const id = setInterval(() => {
			const word = loadingVerbs[verbIndex % loadingVerbs.length];
			if (sweep + 1 >= sweepCycleLength(word)) {
				sweep = 0;
				verbIndex += 1;
			} else {
				sweep += 1;
			}
		}, SWEEP_MS);
		return () => clearInterval(id);
	});

	const showRouterProvider = $derived(gateway ? isRouter(gateway as GatewayName) : false);

	const availableGateways = $derived([...new Set(models.map((m) => m.gateway))]);
	const hasRouter = $derived(availableGateways.some((gw) => isRouter(gw)));
	const topDropdownLabel = $derived(hasRouter ? 'Gateway' : 'Provider');
	const availableProviders = $derived(
		gateway ? [...new Set(models.filter((m) => m.gateway === gateway).map((m) => m.provider))] : []
	);
	const availableModels = $derived(
		gateway && provider
			? models.filter((m) => m.gateway === gateway && m.provider === provider)
			: []
	);

	function isGatewayDisabled(gw: GatewayName): boolean {
		const gwProviders = [...new Set(models.filter((m) => m.gateway === gw).map((m) => m.provider))];
		return gwProviders.every((p) => usedProviders.includes(p));
	}

	function isProviderDisabled(p: string): boolean {
		return usedProviders.includes(p);
	}

	const label = $derived(
		!gateway || !provider
			? ''
			: isRouter(gateway as GatewayName)
				? `${GATEWAY_LABELS[gateway as GatewayName]} — ${getProviderLabel(provider)} ${modelDisplayName}`
				: `${getProviderLabel(provider)} ${modelDisplayName}`
	);

	function handleGatewayChange(e: Event) {
		const newGateway = (e.target as HTMLSelectElement).value as GatewayName;
		const providers = [
			...new Set(models.filter((m) => m.gateway === newGateway).map((m) => m.provider))
		];
		const newProvider = providers.find((p) => !usedProviders.includes(p)) ?? providers[0];
		const gwModels = models.filter((m) => m.gateway === newGateway && m.provider === newProvider);
		onchange?.(newGateway, newProvider, gwModels[0]?.id ?? '');
	}

	function handleProviderChange(e: Event) {
		if (!gateway) return;
		const gw = gateway as GatewayName;
		const newProvider = (e.target as HTMLSelectElement).value;
		const provModels = models.filter((m) => m.gateway === gw && m.provider === newProvider);
		onchange?.(gw, newProvider, provModels[0]?.id ?? '');
	}

	function handleModelChange(e: Event) {
		if (!gateway || !provider) return;
		const newModelId = (e.target as HTMLSelectElement).value;
		onchange?.(gateway as GatewayName, provider, newModelId);
	}

	function handleRandomize() {
		const eligible = models.filter((m) => !usedProviders.includes(m.provider));
		if (eligible.length === 0) return;
		const entry = eligible[Math.floor(Math.random() * eligible.length)];
		onchange?.(entry.gateway, entry.provider, entry.id);
	}
</script>

{#snippet errorCard(message: string)}
	<!-- role="status" so screen readers announce when a model fails. -->
	<div class="flex flex-col items-center justify-center gap-2 py-6 text-center" role="status">
		<CircleAlert size={24} class="magi-error" />
		<p class="text-sm font-medium magi-error">Model unavailable</p>
		<p class="text-xs text-gray-500">{message}</p>
	</div>
{/snippet}

{#snippet interruptedStrip(message: string)}
	<!-- Compact one-line strip for a node that streamed partial text before
	     erroring — the Markdown above gets rendered first, this sits below it.
	     Reserve the full errorCard for the text-less case only. -->
	<p class="text-xs magi-error" role="status">Response interrupted: {message}</p>
{/snippet}

{#snippet tokenFooter(input: number, output: number, estimated: boolean)}
	{#if input > 0 || output > 0}
		<p class="magi-token-split magi-numeric">
			<TokenCount {input} {output} {estimated} total />
		</p>
	{/if}
{/snippet}

{#snippet roundList(rounds: DebateRoundEntry[], live: boolean)}
	{#if rounds.length > 0}
		<div class="flex flex-col gap-2">
			{#each rounds as r, idx (r.round)}
				<!-- Each round is itself a collapsible block — open by default so the
				     live debate reads top-to-bottom, but readers can fold completed
				     rounds away to focus on the final answer or a specific round. The
				     inputs are a nested sub-collapsible underneath. -->
				<details
					class="magi-round group/round flex flex-col gap-1 rounded-md border border-gray-800 bg-gray-900/40 p-2 open:gap-1"
					style:min-height={live && scrollMode === 'snap' && idx === rounds.length - 1
						? snapMinHeight
						: undefined}
					open
				>
					<summary
						class="flex cursor-pointer items-center gap-1 magi-badge text-gray-500 select-none hover:text-gray-300"
					>
						<ChevronRight size={11} class="transition-transform group-open/round:rotate-90" />
						Round {r.round}
					</summary>
					<div class="prose max-w-none prose-invert">
						<Markdown source={r.response} />
					</div>
					<details class="group/inputs">
						<summary
							class="flex cursor-pointer items-center gap-1 magi-meta-strong select-none hover:text-gray-300"
						>
							<ChevronRight size={11} class="transition-transform group-open/inputs:rotate-90" />
							Inputs this round
						</summary>
						<!-- Quoted, tinted block so the debate inputs read as a distinct aside,
						     not a continuation of the round's answer. -->
						<div
							class="mt-1 ml-1.5 rounded border-l-2 border-gray-700 bg-gray-950/60 py-1 pr-1 pl-2 opacity-80"
						>
							<div class="prose max-w-none text-gray-400 prose-invert">
								<Markdown source={r.prompt} />
							</div>
						</div>
					</details>
				</details>
			{/each}
		</div>
	{/if}
{/snippet}

<div
	class="magi-panel flex max-h-[70vh] flex-col overflow-hidden rounded-lg md:max-h-none {collapsed
		? 'min-h-0'
		: 'min-h-72 md:min-h-0'} {status === 'pending' ? 'pulse-glow' : ''}"
	style:--node-color={`var(${NODE_COLOR_VARS[name]})`}
>
	<div class="h-0.5 shrink-0" style="background: var(--node-color)"></div>
	<div class="flex shrink-0 flex-col gap-2 border-b magi-divider px-4 py-3">
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="flex items-center justify-between select-none"
			class:cursor-pointer={onheadertoggle}
			onclick={onHeaderRowClick}
			onkeydown={onHeaderRowKeydown}
			role={onheadertoggle ? 'button' : undefined}
			tabindex={onheadertoggle ? 0 : undefined}
			aria-label={onheadertoggle ? 'Toggle node focus' : undefined}
		>
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="text-base font-bold text-(--node-color) transition-opacity hover:opacity-75"
					onclick={() => onlabelclick?.()}
					use:tooltip={'Switch between MAGI numbers and EVA names'}>{displayLabel}</button
				>
				{#if temperament}
					<span
						class="magi-temperament-badge rounded bg-gray-600/30 px-1.5 py-0.5 magi-chip ring-1 ring-gray-500/30"
						use:tooltip={TEMPERAMENT_TOOLTIPS[temperament]}>{TEMPERAMENT_LABELS[temperament]}</span
					>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if showTokens || showContext}
					<span class="flex items-center magi-numeric text-gray-500" use:tooltip={tokensTooltip}>
						{#if showContext && contextWindow}
							<span class={contextClass}
								>{formatTokenCount(contextUsed)}/{formatTokenCount(contextWindow)}</span
							>
						{:else}
							<TokenCount
								input={totalInput}
								output={totalOutput}
								cached={totalCached}
								estimated={liveEstimated}
							/>
						{/if}
					</span>
				{/if}
				{#if status === 'success' && copyTarget}
					<CopyScopeButton defaultId="final" scopes={copyScopes} title="Copy response" />
				{/if}
				{#if status === 'error'}
					<X size={14} class="magi-error" />
				{:else if status === 'pending'}
					<LoaderCircle size={14} class="animate-spin magi-pending" />
				{:else if status === 'success'}
					<CircleCheck size={14} class="magi-success" />
				{:else if status === 'unknown'}
					<CircleHelp size={14} class="magi-unknown" />
				{:else}
					<div class="h-2 w-2 rounded-full bg-gray-600"></div>
				{/if}
			</div>
		</div>

		{#if onchange}
			<div class="-mx-4 border-t magi-divider"></div>
			{#if inConversation}
				<div class="flex items-center gap-1.5">
					<button
						type="button"
						class="magi-select flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-1 text-left text-xs transition-colors"
						onclick={() => (configExpanded = !configExpanded)}
						aria-label="{displayLabel} configuration"
						aria-expanded={configExpanded}
						use:tooltip={configExpanded ? 'Hide model configuration' : 'Show model configuration'}
					>
						<ChevronRight
							size={12}
							class="shrink-0 transition-transform {configExpanded ? 'rotate-90' : ''}"
						/>
						<span class="truncate">{chipLabel}</span>
					</button>
					<button
						type="button"
						onclick={handleRandomize}
						{disabled}
						class="magi-randomize flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded transition-colors disabled:opacity-50"
						title="Randomize selection"
					>
						<Shuffle size={12} />
					</button>
				</div>
			{/if}
			{#if !inConversation || configExpanded}
				<div class="flex gap-1.5">
					<div class="flex flex-1 flex-col gap-1.5">
						<!-- Gateway / Provider selector -->
						<select
							class="magi-select w-full rounded px-2 py-1 text-xs focus:ring-1 focus:ring-gray-500 focus:outline-none"
							value={gateway}
							onchange={handleGatewayChange}
							{disabled}
						>
							<option disabled value="">{topDropdownLabel}</option>
							<option disabled>───</option>
							{#each availableGateways as gw (gw)}
								<option value={gw} disabled={isGatewayDisabled(gw)}
									>{GATEWAY_LABELS[gw]}{isRouter(gw) ? ' (router)' : ''}</option
								>
							{/each}
						</select>

						<!-- Provider selector (always rendered for consistent height) -->
						<select
							class="magi-select w-full rounded px-2 py-1 text-xs focus:ring-1 focus:ring-gray-500 focus:outline-none {!gateway ||
							!showRouterProvider
								? 'text-gray-600'
								: ''}"
							value={showRouterProvider ? provider : ''}
							onchange={handleProviderChange}
							disabled={disabled || !showRouterProvider}
							tabindex={showRouterProvider ? 0 : -1}
						>
							{#if !gateway}
								<option disabled value="">Provider</option>
							{:else if showRouterProvider}
								<option disabled value="">Provider</option>
								<option disabled>───</option>
								{#each availableProviders as p (p)}
									<option value={p} disabled={isProviderDisabled(p)}>{getProviderLabel(p)}</option>
								{/each}
							{:else}
								<option value="">N/A</option>
							{/if}
						</select>

						<!-- Model selector -->
						<select
							class="magi-select w-full rounded px-2 py-1 text-xs focus:ring-1 focus:ring-gray-500 focus:outline-none"
							value={modelId}
							onchange={handleModelChange}
							{disabled}
						>
							<option disabled value="">Model</option>
							<option disabled>───</option>
							{#each availableModels as model (model.id)}
								<option value={model.id}>{model.displayName}</option>
							{/each}
						</select>
					</div>
					{#if !inConversation}
						<!-- Randomize (idle) — sized to one select row, not the full stack -->
						<button
							type="button"
							onclick={handleRandomize}
							{disabled}
							class="magi-randomize flex h-[26px] w-[26px] shrink-0 items-center justify-center self-center rounded transition-colors disabled:opacity-50"
							title="Randomize selection"
						>
							<Shuffle size={14} />
						</button>
					{/if}
				</div>
			{/if}
		{:else}
			<p class="text-xs text-gray-400">{label}</p>
		{/if}
	</div>
	<div
		class="min-h-0 flex-1 overflow-y-auto"
		class:hidden={collapsed}
		bind:this={scrollEl}
		bind:clientHeight={viewportH}
		onscroll={onScroll}
	>
		<div class="flex flex-col gap-3 p-4" bind:this={contentEl}>
			{#if transcript.length === 0 && !liveQuery}
				<p class="magi-placeholder">Awaiting query...</p>
			{:else}
				{#each transcript as turn, i (i)}
					<div
						class="flex flex-col gap-1.5 {i > 0 ? 'magi-turn-divider border-t pt-3' : ''}"
						style:min-height={!liveQuery && i === transcript.length - 1 ? snapMinHeight : undefined}
					>
						<p class="text-xs font-medium text-gray-400">{turn.query}</p>
						{#if turn.response}
							<div class="prose max-w-none prose-invert">
								<Markdown source={stripSummaryTail(turn.response)} />
							</div>
							{#if turn.error}
								{@render interruptedStrip(turn.error)}
							{/if}
						{:else if turn.error}
							{@render errorCard(turn.error)}
						{:else}
							<p class="magi-placeholder">No response</p>
						{/if}
						{@render roundList(turn.debateRounds ?? [], false)}
						{@render tokenFooter(turn.inputTokens, turn.outputTokens, false)}
					</div>
				{/each}
				{#if liveQuery}
					<div
						class="flex flex-col gap-1.5 {transcript.length > 0
							? 'magi-turn-divider border-t pt-3'
							: ''}"
						style:min-height={debateRounds.length > 0 ? undefined : snapMinHeight}
					>
						<p class="text-xs font-medium text-gray-400">{liveQuery}</p>
						{#if text}
							<div class="prose max-w-none prose-invert">
								<Markdown source={stripSummaryTail(text)} />
							</div>
							{#if status === 'error'}
								<!-- Partial text arrived before the error — compact strip keeps
								     the readable content and labels the interruption inline. -->
								{@render interruptedStrip(error)}
							{/if}
						{:else if status === 'error'}
							{@render errorCard(error)}
						{:else if status === 'unknown'}
							<p class="text-sm magi-unknown">
								Stream ended before this node answered — aborted or connection lost.
							</p>
						{:else if status === 'success'}
							<p class="text-sm text-gray-500">The model returned an empty response.</p>
						{:else}
							<p class="magi-loader-text">{loadingText}…</p>
						{/if}
						{@render roundList(debateRounds, true)}
						{@render tokenFooter(liveInput, liveOutput, liveEstimated)}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	@keyframes pulse-glow {
		0%,
		100% {
			box-shadow: inset 0 0 0 0 transparent;
		}
		50% {
			box-shadow: inset 0 0 20px -4px var(--node-color);
		}
	}

	.pulse-glow {
		animation: pulse-glow 2s ease-in-out infinite;
	}
</style>
