<script lang="ts">
	interface Props {
		text: string;
		fullText: string;
		loading: boolean;
		modelsResponded: boolean;
		warning?: string;
	}

	let { text, fullText, loading, modelsResponded, warning = '' }: Props = $props();
</script>

<div class="rounded-lg border-t-2 border-purple-500 bg-gray-900">
	<div class="flex items-center justify-between border-b border-gray-700 px-4 py-3">
		<div>
			<h3 class="text-sm font-bold text-white">MAGI CONSENSUS</h3>
			<p class="text-xs text-gray-400">Synthesized response</p>
		</div>
		{#if loading && !modelsResponded}
			<div class="h-2 w-2 rounded-full bg-gray-600"></div>
		{:else if loading}
			<div class="h-2 w-2 animate-pulse rounded-full bg-yellow-400"></div>
		{:else if text}
			<div class="flex items-center gap-2">
				{#if fullText}
					<button
						class="text-xs text-gray-400 transition-colors hover:text-white"
						onclick={() => navigator.clipboard.writeText(fullText)}
					>
						Copy
					</button>
				{/if}
				<div class="h-2 w-2 rounded-full bg-green-400"></div>
			</div>
		{/if}
	</div>
	<div class="prose prose-sm p-4 prose-invert">
		{#if warning}
			<p class="text-sm text-amber-400">{warning}</p>
		{/if}
		{#if loading && !modelsResponded}
			<p class="text-gray-500">Waiting for MAGI responses...</p>
		{:else if loading && !text}
			<p class="animate-pulse text-gray-500">Synthesizing consensus...</p>
		{:else if text}
			<p class="whitespace-pre-wrap">{text}</p>
		{:else}
			<p class="text-gray-600">Consensus will appear after all three MAGI respond.</p>
		{/if}
	</div>
</div>
