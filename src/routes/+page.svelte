<script lang="ts">
	import TierSelector from '$lib/components/TierSelector.svelte';
	import StrategySelector from '$lib/components/StrategySelector.svelte';
	import MagiPanel from '$lib/components/MagiPanel.svelte';
	import ConsensusView from '$lib/components/ConsensusView.svelte';
	import type { TierName } from '$lib/magi/types';
	import type { StrategyName } from '$lib/magi/consensus';

	let tier: TierName = $state('balanced');
	let strategy: StrategyName = $state('synthesis');
	let query = $state('');
	let loading = $state(false);

	let responses = $state<{ node: { name: string; provider: string }; text: string }[]>([]);
	let consensus = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!query.trim() || loading) return;

		loading = true;
		responses = [];
		consensus = '';

		const res = await fetch('/api/magi', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query, tier, strategy })
		});

		if (res.ok) {
			const data = await res.json();
			responses = data.responses;
			consensus = data.consensus;
		}

		loading = false;
	}

	function getNodeResponse(name: string) {
		return responses.find((r) => r.node.name === name);
	}
</script>

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
				class="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
			/>
			<button
				type="submit"
				disabled={loading || !query.trim()}
				class="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600"
			>
				{loading ? 'Processing...' : 'Submit'}
			</button>
		</form>

		<!-- Three MAGI panels -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<MagiPanel
				name="MELCHIOR"
				provider="anthropic"
				text={getNodeResponse('MELCHIOR')?.text ?? ''}
				{loading}
			/>
			<MagiPanel
				name="BALTHASAR"
				provider="openai"
				text={getNodeResponse('BALTHASAR')?.text ?? ''}
				{loading}
			/>
			<MagiPanel
				name="CASPAR"
				provider="google"
				text={getNodeResponse('CASPAR')?.text ?? ''}
				{loading}
			/>
		</div>

		<!-- Consensus -->
		<ConsensusView text={consensus} {loading} />
	</main>
</div>
