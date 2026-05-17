<script lang="ts">
	import MagiBackground from '$lib/components/MagiBackground.svelte';
	import TierSelector from '$lib/components/TierSelector.svelte';
	import MagiPanel from '$lib/components/MagiPanel.svelte';
	import ConsensusView from '$lib/components/ConsensusView.svelte';
	import { TIER_CONFIGS, type NodeAssignment } from '$lib/magi/config';
	import {
		DEFAULT_TIER,
		MAGI_NODE_NAMES,
		NODE_TEMPERAMENTS,
		pickDiverseModels,
		type TierName,
		type MagiNodeName,
		type GatewayName,
		type AvailableModel,
		type MagiResponse
	} from '$lib/magi/types';
	import { getModelsForTier, findModelEntry } from '$lib/magi/registry';
	import { DEFAULT_STRATEGY, type StrategyName } from '$lib/magi/consensus';
	import { onMount, onDestroy } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		Triangle,
		LoaderCircle,
		CircleAlert,
		ArrowLeftRight,
		X,
		Brain,
		Copy,
		Check,
		Settings
	} from 'lucide-svelte';

	interface MagiModelError {
		node: MagiNodeName;
		gateway: GatewayName;
		provider: string;
		error: string;
	}

	const RANDOM_PROMPTS = [
		'What is consciousness?',
		'Is mathematics discovered or invented?',
		'What will be the most important technology in 2050?',
		'Is free will an illusion?',
		'Should AI systems have rights?',
		'What is the hardest problem in science right now?',
		"Explain quantum entanglement like I'm ten years old",
		'What would a perfect education system look like?',
		'Are humans fundamentally good or fundamentally selfish?',
		'What is the most underrated invention in history?',
		'If you could send one message to every human on Earth, what would it be?',
		'What is the strongest argument against your own existence?',
		'Why do we dream?',
		'What would first contact with an alien civilization actually look like?',
		'Is there a limit to what science can explain?'
	];

	let tier: TierName = $state(DEFAULT_TIER);
	let strategy: StrategyName = $state(DEFAULT_STRATEGY);
	let temperaments = $state(false);
	let genericLabels = $state(true);
	let query = $state('');
	let loading = $state(false);
	let configuredNodes = new SvelteSet([0, 1, 2]);
	let consensusNode: MagiNodeName = $state('MELCHIOR');
	let availableModels = $state<AvailableModel[]>([]);
	let modelsLoading = $state(true);
	let copiedQuery = $state(false);
	let settingsOpen = $state(false);
	let consensusTemperament = $state(false);
	let temperamentAwareness = $state(false);
	let bgVariant = $state<'columns' | 'orbs'>('columns');
	let theme = $state<'dark' | 'light'>('dark');

	function copyQuery() {
		navigator.clipboard.writeText(query).catch(() => {});
		copiedQuery = true;
		setTimeout(() => (copiedQuery = false), 1500);
	}

	let assignments = $state<[NodeAssignment, NodeAssignment, NodeAssignment]>(
		// Placeholder — will be replaced once models are fetched for free tier,
		// or immediately populated from TIER_CONFIGS for paid tiers
		[...TIER_CONFIGS.balanced] as [NodeAssignment, NodeAssignment, NodeAssignment]
	);

	interface TierSnapshot {
		responses: MagiResponse[];
		modelStreams: Record<MagiNodeName, string>;
		modelErrors: MagiModelError[];
		consensusStream: string;
		consensusFinal: string;
		consensusWarning: string;
		error: string;
		streamDone: boolean;
		assignments: [NodeAssignment, NodeAssignment, NodeAssignment];
		configuredNodes: Set<number>;
		consensusNode: MagiNodeName;
	}

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive cache, never triggers UI updates
	const tierCache = new Map<TierName, TierSnapshot>();

	let responses = $state<MagiResponse[]>([]);
	let modelStreams = $state<Record<MagiNodeName, string>>({
		MELCHIOR: '',
		BALTHASAR: '',
		CASPAR: ''
	});
	let modelErrors = $state<MagiModelError[]>([]);
	let consensusStream = $state('');
	let consensusFinal = $state('');
	let consensusWarning = $state('');
	let error = $state('');
	let streamDone = $state(false);
	let abortController: AbortController | null = null;

	type NodeStatus = 'idle' | 'pending' | 'success' | 'error' | 'unknown';

	const responseMap = $derived(new Map(responses.map((r) => [r.node, r])));
	const errorMap = $derived(new Map(modelErrors.map((e) => [e.node, e.error])));
	const allModelsResponded = $derived(responses.length + modelErrors.length >= 3);

	const consensusAssignment = $derived(
		assignments.find((a) => a.node === consensusNode) ?? assignments[0]
	);

	function getNodeStatus(node: MagiNodeName): NodeStatus {
		if (errorMap.get(node)) return 'error';
		if (responseMap.get(node)) return 'success';
		if (loading && !streamDone) return 'pending';
		if (loading && streamDone) return 'unknown';
		return 'idle';
	}

	function getModelDisplayName(assignment: NodeAssignment): string {
		// Check static registry first, then dynamic models
		const entry = findModelEntry(assignment.gateway, assignment.modelId);
		if (entry) return entry.displayName;
		const dynamic = availableModels.find((m) => m.id === assignment.modelId);
		return dynamic?.displayName ?? assignment.modelId;
	}

	function getStaticModels(t: TierName): AvailableModel[] {
		return getModelsForTier(t).map((m) => ({
			id: m.id,
			gateway: m.gateway,
			provider: m.provider,
			displayName: m.displayName
		}));
	}

	function assignDiverseDefaults(models: AvailableModel[]): NodeAssignment[] {
		return pickDiverseModels(models, 3).map((m, i) => ({
			node: MAGI_NODE_NAMES[i],
			gateway: m.gateway,
			provider: m.provider,
			modelId: m.id
		}));
	}

	async function fetchModels(t: TierName) {
		modelsLoading = true;
		try {
			if (t === 'free') {
				const res = await fetch(`/api/magi/models?tier=${t}`);
				const data = (await res.json()) as { models: AvailableModel[] };
				availableModels = data.models;
			} else {
				availableModels = getStaticModels(t);
			}

			// Set default assignments if no snapshot exists for this tier
			if (!tierCache.has(t) && availableModels.length >= 3) {
				if (t === 'free') {
					const defaults = assignDiverseDefaults(availableModels);
					assignments = defaults as [NodeAssignment, NodeAssignment, NodeAssignment];
				} else {
					assignments = [...TIER_CONFIGS[t]] as [NodeAssignment, NodeAssignment, NodeAssignment];
				}
				configuredNodes.clear();
				configuredNodes.add(0);
				configuredNodes.add(1);
				configuredNodes.add(2);
				consensusNode = 'MELCHIOR';
			}
		} catch {
			if (t !== 'free') {
				availableModels = getStaticModels(t);
			}
		}
		modelsLoading = false;
	}

	onMount(() => fetchModels(tier));

	function saveTierSnapshot() {
		tierCache.set(tier, {
			responses,
			modelStreams: { ...modelStreams },
			modelErrors,
			consensusStream,
			consensusFinal,
			consensusWarning,
			error,
			streamDone,
			assignments: [...assignments] as [NodeAssignment, NodeAssignment, NodeAssignment],
			configuredNodes: new Set(configuredNodes),
			consensusNode
		});
	}

	function loadTierSnapshot(t: TierName) {
		const cached = tierCache.get(t);
		if (cached) {
			responses = cached.responses;
			modelStreams = { ...cached.modelStreams };
			modelErrors = cached.modelErrors;
			consensusStream = cached.consensusStream;
			consensusFinal = cached.consensusFinal;
			consensusWarning = cached.consensusWarning;
			error = cached.error;
			streamDone = cached.streamDone;
			assignments = [...cached.assignments] as [NodeAssignment, NodeAssignment, NodeAssignment];
			configuredNodes.clear();
			for (const v of cached.configuredNodes) configuredNodes.add(v);
			consensusNode = cached.consensusNode;
		} else {
			responses = [];
			modelStreams = { MELCHIOR: '', BALTHASAR: '', CASPAR: '' };
			modelErrors = [];
			consensusStream = '';
			consensusFinal = '';
			consensusWarning = '';
			error = '';
			streamDone = false;
			configuredNodes.clear();
			configuredNodes.add(0);
			configuredNodes.add(1);
			configuredNodes.add(2);
			consensusNode = 'MELCHIOR';
		}
	}

	function handleTierChange(newTier: TierName) {
		if (newTier === tier || loading) return;
		saveTierSnapshot();
		tier = newTier;
		loadTierSnapshot(newTier);
		fetchModels(newTier);
	}

	function getUsedProviders(excludeIndex: number): string[] {
		return assignments
			.filter((_, i) => i !== excludeIndex && configuredNodes.has(i))
			.map((a) => a.provider);
	}

	function handleNodeChange(
		nodeIndex: number,
		gateway: GatewayName,
		provider: string,
		modelId: string
	) {
		configuredNodes.add(nodeIndex);
		const node = MAGI_NODE_NAMES[nodeIndex];
		assignments[nodeIndex] = { node, gateway, provider, modelId };
	}

	const allConfigured = $derived(configuredNodes.size === 3);

	function handleSwap(a: number, b: number) {
		const { node: nodeA, ...restA } = assignments[a];
		const { node: nodeB, ...restB } = assignments[b];
		assignments[a] = { node: nodeA, ...restB };
		assignments[b] = { node: nodeB, ...restA };
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading || !allConfigured) return;

		if (!query.trim()) {
			query = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
		}

		abortController?.abort();
		abortController = new AbortController();

		loading = true;
		responses = [];
		modelStreams = { MELCHIOR: '', BALTHASAR: '', CASPAR: '' };
		modelErrors = [];
		consensusStream = '';
		consensusFinal = '';
		consensusWarning = '';
		error = '';
		streamDone = false;

		try {
			const res = await fetch('/api/magi', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query,
					tier,
					strategy,
					consensusNode,
					assignments,
					temperaments,
					consensusTemperament,
					temperamentAwareness,
					genericLabels
				}),
				signal: abortController.signal
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({ error: 'Request failed' }));
				error = data.error ?? `Request failed (${res.status})`;
				streamDone = true;
				loading = false;
				return;
			}

			const reader = res.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const parts = buffer.split('\n\n');
				buffer = parts.pop() ?? '';

				for (const part of parts) {
					let event = '';
					let data = '';
					for (const line of part.split('\n')) {
						if (line.startsWith('event: ')) event = line.slice(7);
						else if (line.startsWith('data: ')) data = line.slice(6);
					}
					if (event && data) {
						try {
							handleEvent(event, JSON.parse(data));
						} catch {
							// Malformed SSE data — skip silently
						}
					}
				}
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				streamDone = true;
				loading = false;
				return;
			}
			error = err instanceof Error ? err.message : 'Network error';
		}

		streamDone = true;
		loading = false;
	}

	function handleEvent(event: string, data: unknown) {
		switch (event) {
			case 'config':
				assignments = data as NodeAssignment[] as [NodeAssignment, NodeAssignment, NodeAssignment];
				break;
			case 'model-chunk': {
				const { node, text } = data as { node: string; text: string };
				if (node in modelStreams && typeof text === 'string') {
					modelStreams[node as MagiNodeName] += text;
				}
				break;
			}
			case 'model-response':
				responses = [...responses, data as MagiResponse];
				break;
			case 'model-error':
				modelErrors = [...modelErrors, data as MagiModelError];
				break;
			case 'consensus-chunk':
				consensusStream += (data as { text: string }).text;
				break;
			case 'consensus-complete':
				consensusFinal = (data as { text: string }).text;
				break;
			case 'partial-consensus': {
				const d = data as { responded: number; total: number };
				consensusWarning = `Only ${d.responded} of ${d.total} models responded — consensus is based on partial data.`;
				break;
			}
			case 'error':
				error = (data as { message: string }).message;
				break;
		}
	}

	onDestroy(() => abortController?.abort());
</script>

<svelte:head>
	<title>MAGI</title>
</svelte:head>

<div
	class="magi-bg flex h-screen flex-col overflow-y-auto bg-gray-950 text-white md:overflow-hidden {theme ===
	'light'
		? 'light'
		: ''}"
>
	<MagiBackground variant={bgVariant} />

	<!-- Header -->
	<header class="magi-header relative z-30 shrink-0 border-b border-gray-800 bg-gray-950">
		<div class="relative mx-auto max-w-7xl px-6 py-4">
			<h1 class="text-center text-2xl font-bold tracking-wider">
				MAGI <span class="text-lg">🔺🔻🔺</span>
			</h1>
			<button
				type="button"
				class="absolute top-1/2 right-6 -translate-y-1/2 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
				onclick={() => (settingsOpen = !settingsOpen)}
				title="Settings"
			>
				<Settings size={16} />
			</button>
		</div>
	</header>

	<!-- Control strip -->
	<div class="magi-controls relative z-10 shrink-0 border-b border-gray-800 bg-gray-950/80">
		<div
			class="mx-auto flex max-w-7xl flex-col items-center gap-2 px-6 py-2 sm:flex-row sm:justify-between"
		>
			<div class="flex items-center gap-2">
				<span class="text-xs text-gray-500">TIER</span>
				<TierSelector value={tier} onchange={handleTierChange} disabled={loading} />
			</div>
			<div class="flex items-center gap-2">
				<span class="text-xs text-gray-500">TEMPERAMENT</span>
				<button
					type="button"
					onclick={() => (temperaments = !temperaments)}
					disabled={loading}
					class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors {temperaments
						? 'magi-temperament-on bg-gray-600/30 text-gray-200 ring-1 ring-gray-500/50'
						: 'magi-temperament-off bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'} disabled:opacity-50"
					title={temperaments
						? 'Temperaments active — each node responds through its dispositional lens'
						: 'Enable temperaments — give each MAGI node a distinct dispositional personality'}
				>
					<Brain size={12} />
					{temperaments ? 'ON' : 'OFF'}
				</button>
			</div>
		</div>
	</div>

	<!-- Main content -->
	<main class="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-6 md:min-h-0">
		<!-- Query input -->
		<form onsubmit={handleSubmit} class="flex shrink-0 gap-3">
			<div class="relative flex-1">
				<input
					bind:value={query}
					type="text"
					placeholder="Ask the MAGI system... or click Execute for a random prompt"
					disabled={loading}
					class="magi-input w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 pr-10 text-white placeholder-gray-500 focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none"
				/>
				{#if query.trim()}
					<button
						type="button"
						class="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 transition-colors hover:text-white"
						onclick={copyQuery}
						title="Copy prompt"
					>
						{#if copiedQuery}
							<Check size={14} class="text-green-400" />
						{:else}
							<Copy size={14} />
						{/if}
					</button>
				{/if}
			</div>
			{#if loading}
				<button
					type="button"
					onclick={() => abortController?.abort()}
					class="magi-btn group flex w-40 items-center justify-center gap-2 rounded-lg bg-gray-600 py-3 font-medium text-white transition-colors hover:bg-red-600"
				>
					<span class="flex items-center gap-2 group-hover:hidden">
						<LoaderCircle size={16} class="animate-spin" /> Processing...
					</span>
					<span class="hidden items-center gap-2 group-hover:flex">
						<X size={16} /> Abort
					</span>
				</button>
			{:else}
				<button
					type="submit"
					disabled={!allConfigured || modelsLoading}
					class="magi-btn flex w-40 items-center justify-center gap-2 rounded-lg bg-gray-600 py-3 font-medium text-white transition-colors hover:bg-gray-500 disabled:opacity-50 disabled:hover:bg-gray-600"
				>
					<Triangle size={14} class="rotate-90 fill-current" /> Execute
				</button>
			{/if}
		</form>

		<!-- Global error -->
		{#if error}
			<div
				class="flex shrink-0 items-center gap-2 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300"
			>
				<CircleAlert size={16} class="shrink-0" />
				{error}
			</div>
		{/if}

		<!-- Three MAGI panels -->
		<div
			class="grid flex-2 grid-cols-1 gap-2 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:overflow-hidden"
		>
			{#each assignments as assignment, i (assignment.node)}
				{#if i > 0}
					<div class="hidden items-center md:flex">
						<button
							type="button"
							onclick={() => handleSwap(i - 1, i)}
							disabled={loading}
							class="rounded p-1 text-gray-600 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-50"
							title="Swap configurations"
						>
							<ArrowLeftRight size={16} />
						</button>
					</div>
				{/if}
				<MagiPanel
					name={assignment.node}
					models={availableModels}
					gateway={configuredNodes.has(i) ? assignment.gateway : ''}
					provider={configuredNodes.has(i) ? assignment.provider : ''}
					modelId={configuredNodes.has(i) ? assignment.modelId : ''}
					modelDisplayName={getModelDisplayName(assignment)}
					text={responseMap.get(assignment.node)?.text ?? modelStreams[assignment.node]}
					error={errorMap.get(assignment.node) ?? ''}
					status={getNodeStatus(assignment.node)}
					temperament={temperaments ? NODE_TEMPERAMENTS[assignment.node] : undefined}
					{genericLabels}
					disabled={loading}
					usedProviders={getUsedProviders(i)}
					onchange={(gw, prov, model) => handleNodeChange(i, gw, prov, model)}
					onlabelclick={() => (genericLabels = !genericLabels)}
				/>
			{/each}
		</div>

		<!-- Consensus -->
		<div class="flex-1 md:min-h-0">
			<ConsensusView
				text={consensusStream}
				fullText={consensusFinal}
				{loading}
				{allModelsResponded}
				warning={consensusWarning}
				{strategy}
				{consensusNode}
				consensusGateway={consensusAssignment.gateway}
				consensusProvider={consensusAssignment.provider}
				consensusModelDisplayName={getModelDisplayName(consensusAssignment)}
				{consensusTemperament}
				{temperamentAwareness}
				{genericLabels}
				disabled={loading}
				onstrategychange={(s) => (strategy = s)}
				onconsensuschange={(node) => (consensusNode = node)}
				onconsensustemperamentchange={temperaments ? (v) => (consensusTemperament = v) : undefined}
				onawarenesschange={temperaments ? (v) => (temperamentAwareness = v) : undefined}
			/>
		</div>
	</main>
</div>

{#if settingsOpen}
	<button
		class="fixed inset-0 z-40 cursor-default"
		onclick={() => (settingsOpen = false)}
		aria-label="Close settings"
	></button>
	<div class="pointer-events-none fixed top-14 right-0 left-0 z-50 mx-auto max-w-7xl px-6">
		<div
			class="pointer-events-auto ml-auto w-48 rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-xl"
		>
			<span class="text-xs font-medium text-gray-400">Theme</span>
			<div class="mt-2 flex flex-col gap-1">
				<button
					class="rounded px-3 py-1.5 text-left text-sm transition-colors {theme === 'dark'
						? 'bg-gray-600 text-white'
						: 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
					onclick={() => (theme = 'dark')}
				>
					Dark
				</button>
				<button
					class="rounded px-3 py-1.5 text-left text-sm transition-colors {theme === 'light'
						? 'bg-gray-600 text-white'
						: 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
					onclick={() => (theme = 'light')}
				>
					Light
				</button>
			</div>
			<span class="mt-3 text-xs font-medium text-gray-400">Background</span>
			<div class="mt-2 flex flex-col gap-1">
				<button
					class="rounded px-3 py-1.5 text-left text-sm transition-colors {bgVariant === 'columns'
						? 'bg-gray-600 text-white'
						: 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
					onclick={() => (bgVariant = 'columns')}
				>
					Columns
				</button>
				<button
					class="rounded px-3 py-1.5 text-left text-sm transition-colors {bgVariant === 'orbs'
						? 'bg-gray-600 text-white'
						: 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
					onclick={() => (bgVariant = 'orbs')}
				>
					Orbs
				</button>
			</div>
		</div>
	</div>
{/if}
