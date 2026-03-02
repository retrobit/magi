<script lang="ts">
	import TierSelector from '$lib/components/TierSelector.svelte';
	import StrategySelector from '$lib/components/StrategySelector.svelte';
	import MagiPanel from '$lib/components/MagiPanel.svelte';
	import ConsensusView from '$lib/components/ConsensusView.svelte';
	import { DEFAULT_MAGI_CONFIG, type NodeAssignment } from '$lib/magi/config';
	import {
		DEFAULT_TIER,
		type TierName,
		type MagiNodeName,
		type ProviderName,
		type MagiResponse
	} from '$lib/magi/types';
	import { DEFAULT_STRATEGY, type StrategyName } from '$lib/magi/consensus';
	import { onDestroy } from 'svelte';

	interface MagiModelError {
		node: MagiNodeName;
		provider: ProviderName;
		error: string;
	}

	let tier: TierName = $state(DEFAULT_TIER);
	let strategy: StrategyName = $state(DEFAULT_STRATEGY);
	let query = $state('');
	let loading = $state(false);

	let nodeConfig = $state<readonly NodeAssignment[]>(DEFAULT_MAGI_CONFIG);
	let responses = $state<MagiResponse[]>([]);
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
	const modelsResponded = $derived(responses.length + modelErrors.length > 0);

	function getNodeStatus(node: MagiNodeName): NodeStatus {
		if (errorMap.get(node)) return 'error';
		if (responseMap.get(node)) return 'success';
		if (loading && !streamDone) return 'pending';
		if (loading && streamDone) return 'unknown';
		return 'idle';
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!query.trim() || loading) return;

		abortController?.abort();
		abortController = new AbortController();

		loading = true;
		nodeConfig = DEFAULT_MAGI_CONFIG;
		responses = [];
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
				body: JSON.stringify({ query, tier, strategy }),
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
				nodeConfig = data as NodeAssignment[];
				break;
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

<div class="flex min-h-screen flex-col bg-gray-950 text-white">
	<!-- Header -->
	<header class="border-b border-gray-800 px-6 py-4">
		<div class="mx-auto flex max-w-7xl items-center justify-between">
			<h1 class="text-2xl font-bold tracking-wider">MAGI</h1>
			<div class="flex items-center gap-4">
				<div class="flex items-center gap-2">
					<span class="text-xs text-gray-500">TIER</span>
					<TierSelector value={tier} onchange={(t) => (tier = t)} disabled={loading} />
				</div>
				<div class="flex items-center gap-2">
					<span class="text-xs text-gray-500">CONSENSUS</span>
					<StrategySelector value={strategy} onchange={(s) => (strategy = s)} disabled={loading} />
				</div>
			</div>
		</div>
	</header>

	<!-- Main content -->
	<main class="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-6">
		<!-- Query input -->
		<form onsubmit={handleSubmit} class="flex gap-3">
			<input
				bind:value={query}
				type="text"
				placeholder="Ask the MAGI system..."
				disabled={loading}
				class="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
			/>
			<button
				type="submit"
				disabled={loading || !query.trim()}
				class="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600"
			>
				{loading ? 'Processing...' : 'Submit'}
			</button>
		</form>

		<!-- Global error -->
		{#if error}
			<div class="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
				{error}
			</div>
		{/if}

		<!-- Three MAGI panels -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			{#each nodeConfig as { node, provider } (node)}
				<MagiPanel
					name={node}
					{provider}
					text={responseMap.get(node)?.text ?? ''}
					error={errorMap.get(node) ?? ''}
					status={getNodeStatus(node)}
				/>
			{/each}
		</div>

		<!-- Consensus -->
		<ConsensusView
			text={consensusStream}
			fullText={consensusFinal}
			{loading}
			{modelsResponded}
			warning={consensusWarning}
		/>
	</main>
</div>
