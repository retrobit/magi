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
		type TierName,
		type MagiNodeName,
		type GatewayName,
		type AvailableModel,
		type MagiResponse
	} from '$lib/magi/types';
	import { getModelsForTier, findModelEntry } from '$lib/magi/registry';
	import { DEFAULT_STRATEGY, type StrategyName } from '$lib/magi/consensus';
	import { onMount, onDestroy } from 'svelte';
	import { Triangle, LoaderCircle, CircleAlert, ArrowLeftRight, X, Brain } from 'lucide-svelte';

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
		'Explain quantum entanglement like I\'m ten years old',
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
	let genericLabels = $state(false);
	let query = $state('');
	let loading = $state(false);
	let configuredNodes = $state<Set<number>>(new Set([0, 1, 2]));
	let consensusNode: MagiNodeName = $state('MELCHIOR');
	let availableModels = $state<AvailableModel[]>([]);
	let modelsLoading = $state(true);

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

	function pickDiverseDefaults(models: AvailableModel[]): NodeAssignment[] {
		const picked: AvailableModel[] = [];
		const usedProviders = new Set<string>();
		for (const m of models) {
			if (usedProviders.has(m.provider)) continue;
			picked.push(m);
			usedProviders.add(m.provider);
			if (picked.length >= 3) break;
		}
		return picked.map((m, i) => ({
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
					const defaults = pickDiverseDefaults(availableModels);
					assignments = defaults as [NodeAssignment, NodeAssignment, NodeAssignment];
				} else {
					assignments = [...TIER_CONFIGS[t]] as [NodeAssignment, NodeAssignment, NodeAssignment];
				}
				configuredNodes = new Set([0, 1, 2]);
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
			configuredNodes = new Set(cached.configuredNodes);
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
			configuredNodes = new Set([0, 1, 2]);
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
		configuredNodes = new Set(configuredNodes);
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
				body: JSON.stringify({ query, tier, strategy, consensusNode, assignments, temperaments }),
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
							console.warn('[MAGI] Failed to parse SSE data for event:', event);
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

<div class="magi-bg flex h-screen flex-col overflow-hidden bg-gray-950 text-white">
	<MagiBackground />

	<!-- Header -->
	<header class="shrink-0 border-b border-gray-800">
		<div class="mx-auto max-w-7xl px-6 py-4">
			<h1 class="text-center text-2xl font-bold tracking-wider">
				MAGI <span class="text-lg">🔺🔻🔺</span>
			</h1>
		</div>
	</header>

	<!-- Control strip -->
	<div class="shrink-0 border-b border-gray-800 bg-gray-950/80">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-2">
			<div class="flex items-center gap-2">
				<span class="text-xs text-gray-500">TEMPERAMENT</span>
				<button
					type="button"
					onclick={() => (temperaments = !temperaments)}
					disabled={loading}
					class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors {temperaments
						? 'bg-gray-600/30 text-gray-200 ring-1 ring-gray-500/50'
						: 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'} disabled:opacity-50"
					title={temperaments
						? 'Temperaments active — each node responds through its dispositional lens'
						: 'Enable temperaments — give each MAGI node a distinct dispositional personality'}
				>
					<Brain size={12} />
					{temperaments ? 'ON' : 'OFF'}
				</button>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-xs text-gray-500">TIER</span>
				<TierSelector value={tier} onchange={handleTierChange} disabled={loading} />
			</div>
		</div>
	</div>

	<!-- Main content -->
	<main class="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 p-6">
		<!-- Query input -->
		<form onsubmit={handleSubmit} class="flex shrink-0 gap-3">
			<input
				bind:value={query}
				type="text"
				placeholder="Ask the MAGI system..."
				disabled={loading}
				class="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder-gray-500 focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none"
			/>
			{#if loading}
				<button
					type="button"
					onclick={() => abortController?.abort()}
					class="group flex w-40 items-center justify-center gap-2 rounded-lg bg-gray-600 py-3 font-medium text-white transition-colors hover:bg-red-600"
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
					class="flex w-40 items-center justify-center gap-2 rounded-lg bg-gray-600 py-3 font-medium text-white transition-colors hover:bg-gray-500 disabled:opacity-50 disabled:hover:bg-gray-600"
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
			class="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]"
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
		<div class="min-h-0 flex-1">
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
				{genericLabels}
				disabled={loading}
				onstrategychange={(s) => (strategy = s)}
				onconsensuschange={(node) => (consensusNode = node)}
			/>
		</div>
	</main>
</div>
