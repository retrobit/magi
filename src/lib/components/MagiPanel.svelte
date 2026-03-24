<script lang="ts">
	import type { MagiNodeName, GatewayName, ProviderName } from '$lib/magi/types';
	import { isRouter } from '$lib/magi/types';

	interface Props {
		name: MagiNodeName;
		gateway: GatewayName;
		provider: ProviderName;
		modelDisplayName: string;
		text: string;
		error: string;
		status: 'idle' | 'pending' | 'success' | 'error' | 'unknown';
	}

	let { name, gateway, provider, modelDisplayName, text, error, status }: Props = $props();

	const gatewayColors: Record<GatewayName, string> = {
		anthropic: 'border-orange-500',
		openai: 'border-green-500',
		google: 'border-blue-500',
		openrouter: 'border-violet-500'
	};

	const gatewayLabels: Record<GatewayName, string> = {
		anthropic: 'Anthropic',
		openai: 'OpenAI',
		google: 'Google',
		openrouter: 'OpenRouter'
	};

	const providerLabels: Record<ProviderName, string> = {
		anthropic: 'Anthropic',
		openai: 'OpenAI',
		google: 'Google',
		stepfun: 'StepFun',
		nvidia: 'NVIDIA',
		'arcee-ai': 'Arcee AI'
	};

	const label = $derived(
		isRouter(gateway)
			? `${gatewayLabels[gateway]} — ${providerLabels[provider]} ${modelDisplayName}`
			: `${providerLabels[provider]} ${modelDisplayName}`
	);
</script>

<div class="flex min-h-50 flex-col rounded-lg border-t-2 bg-gray-900 {gatewayColors[gateway]}">
	<div class="flex items-center justify-between border-b border-gray-700 px-4 py-3">
		<div>
			<h3 class="text-sm font-bold text-white">{name}</h3>
			<p class="text-xs text-gray-400">{label}</p>
		</div>
		{#if status === 'error'}
			<div class="h-2 w-2 rounded-full bg-red-500"></div>
		{:else if status === 'pending'}
			<div class="h-2 w-2 animate-pulse rounded-full bg-yellow-400"></div>
		{:else if status === 'success'}
			<div class="h-2 w-2 rounded-full bg-green-400"></div>
		{:else if status === 'unknown'}
			<div class="h-2 w-2 rounded-full bg-orange-500"></div>
		{:else}
			<div class="h-2 w-2 rounded-full bg-gray-600"></div>
		{/if}
	</div>
	<div class="prose prose-sm flex-1 p-4 prose-invert">
		{#if status === 'error'}
			<p class="text-red-400">{error}</p>
		{:else if status === 'pending'}
			<p class="animate-pulse text-gray-500">Thinking...</p>
		{:else if status === 'unknown'}
			<p class="text-orange-400">No response received</p>
		{:else if text}
			<p class="whitespace-pre-wrap">{text}</p>
		{:else}
			<p class="text-gray-600">Awaiting query...</p>
		{/if}
	</div>
</div>
