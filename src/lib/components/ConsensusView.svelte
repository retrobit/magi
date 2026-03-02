<script lang="ts">
	interface Props {
		text: string;
		loading: boolean;
	}

	let { text, loading }: Props = $props();
</script>

<div class="rounded-lg border-t-2 border-purple-500 bg-gray-900">
	<div class="flex items-center justify-between border-b border-gray-700 px-4 py-3">
		<div>
			<h3 class="text-sm font-bold text-white">MAGI CONSENSUS</h3>
			<p class="text-xs text-gray-400">Synthesized response</p>
		</div>
		{#if loading}
			<div class="h-2 w-2 animate-pulse rounded-full bg-yellow-400"></div>
		{:else if text}
			<div class="h-2 w-2 rounded-full bg-green-400"></div>
		{/if}
	</div>
	<div class="prose prose-invert prose-sm p-4">
		{#if loading && !text}
			<p class="animate-pulse text-gray-500">Synthesizing consensus...</p>
		{:else if text}
			<p class="whitespace-pre-wrap">{text}</p>
		{:else}
			<p class="text-gray-600">Consensus will appear after all three MAGI respond.</p>
		{/if}
	</div>
</div>
