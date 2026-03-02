<script lang="ts">
	import type { MagiNodeName, ProviderName } from '$lib/magi/types';

	interface Props {
		name: MagiNodeName;
		provider: ProviderName;
		text: string;
		loading: boolean;
	}

	let { name, provider, text, loading }: Props = $props();

	const providerColors: Record<ProviderName, string> = {
		anthropic: 'border-orange-500',
		openai: 'border-green-500',
		google: 'border-blue-500'
	};

	const providerLabels: Record<ProviderName, string> = {
		anthropic: 'Anthropic Claude',
		openai: 'OpenAI GPT',
		google: 'Google Gemini'
	};
</script>

<div
	class="flex min-h-[200px] flex-col rounded-lg border-t-2 bg-gray-900 {providerColors[provider]}"
>
	<div class="flex items-center justify-between border-b border-gray-700 px-4 py-3">
		<div>
			<h3 class="text-sm font-bold text-white">{name}</h3>
			<p class="text-xs text-gray-400">{providerLabels[provider]}</p>
		</div>
		{#if loading}
			<div class="h-2 w-2 animate-pulse rounded-full bg-yellow-400"></div>
		{:else if text}
			<div class="h-2 w-2 rounded-full bg-green-400"></div>
		{:else}
			<div class="h-2 w-2 rounded-full bg-gray-600"></div>
		{/if}
	</div>
	<div class="prose prose-invert prose-sm flex-1 p-4">
		{#if loading && !text}
			<p class="animate-pulse text-gray-500">Thinking...</p>
		{:else if text}
			<p class="whitespace-pre-wrap">{text}</p>
		{:else}
			<p class="text-gray-600">Awaiting query...</p>
		{/if}
	</div>
</div>
