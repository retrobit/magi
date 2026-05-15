<script lang="ts">
	import type { MagiNodeName, GatewayName, TemperamentName, AvailableModel } from '$lib/magi/types';
	import {
		GATEWAY_LABELS,
		NODE_COLORS,
		NODE_HEX_COLORS,
		NODE_LABELS,
		NODE_LABELS_GENERIC,
		TEMPERAMENT_LABELS,
		getProviderLabel,
		isRouter
	} from '$lib/magi/types';
	import Markdown from './Markdown.svelte';
	import { Shuffle, CircleAlert, LoaderCircle, CircleCheck, CircleHelp, Copy } from 'lucide-svelte';

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
		temperament?: TemperamentName;
		genericLabels?: boolean;
		disabled?: boolean;
		usedProviders?: string[];
		onchange?: (gateway: GatewayName, provider: string, modelId: string) => void;
		onlabelclick?: () => void;
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
		temperament,
		genericLabels = false,
		disabled = false,
		usedProviders = [],
		onchange,
		onlabelclick
	}: Props = $props();

	const displayLabel = $derived(genericLabels ? NODE_LABELS_GENERIC[name] : NODE_LABELS[name]);

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

<div
	class="flex min-h-48 flex-col rounded-lg border-t-2 bg-gray-900/70 {NODE_COLORS[name]} {status ===
	'pending'
		? 'pulse-glow'
		: ''}"
	style:--node-color={NODE_HEX_COLORS[name]}
>
	<div class="flex shrink-0 flex-col gap-2 border-b border-gray-700 px-4 py-3">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="text-sm font-bold text-white transition-colors hover:text-gray-300"
					onclick={() => onlabelclick?.()}>{displayLabel}</button
				>
				{#if temperament}
					<span
						class="rounded bg-gray-600/30 px-1.5 py-0.5 text-[10px] font-medium text-gray-300 ring-1 ring-gray-500/30"
						>{TEMPERAMENT_LABELS[temperament]}</span
					>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if status === 'success' && text}
					<button
						class="text-gray-400 transition-colors hover:text-white"
						onclick={() => navigator.clipboard.writeText(text).catch(() => {})}
						title="Copy response"
					>
						<Copy size={14} />
					</button>
				{/if}
				{#if status === 'error'}
					<CircleAlert size={14} class="text-red-500" />
				{:else if status === 'pending'}
					<LoaderCircle size={14} class="animate-spin text-yellow-400" />
				{:else if status === 'success'}
					<CircleCheck size={14} class="text-green-400" />
				{:else if status === 'unknown'}
					<CircleHelp size={14} class="text-orange-500" />
				{:else}
					<div class="h-2 w-2 rounded-full bg-gray-600"></div>
				{/if}
			</div>
		</div>

		{#if onchange}
			<div class="border-t border-gray-700"></div>
			<div class="flex gap-1.5">
				<div class="flex flex-1 flex-col gap-1.5">
					<!-- Gateway / Provider selector -->
					<select
						class="w-full rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:ring-1 focus:ring-gray-500 focus:outline-none"
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
						class="w-full rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:ring-1 focus:ring-gray-500 focus:outline-none {!gateway ||
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
						class="w-full rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:ring-1 focus:ring-gray-500 focus:outline-none"
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
				<!-- Randomize -->
				<button
					type="button"
					onclick={handleRandomize}
					{disabled}
					class="flex items-center justify-center rounded bg-gray-800 px-2 text-gray-500 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-50"
					title="Randomize selection"
				>
					<Shuffle size={14} />
				</button>
			</div>
		{:else}
			<p class="text-xs text-gray-400">{label}</p>
		{/if}
	</div>
	<div class="prose prose-sm min-h-0 max-w-none flex-1 overflow-y-auto p-4 prose-invert">
		{#if status === 'error'}
			<div class="flex flex-col items-center justify-center gap-2 py-6 text-center">
				<CircleAlert size={24} class="text-red-500" />
				<p class="text-sm font-medium text-red-400">Model unavailable</p>
				<p class="text-xs text-gray-500">{error}</p>
			</div>
		{:else if status === 'pending' && text}
			<Markdown source={text} />
		{:else if status === 'pending'}
			<p class="text-gray-500">Thinking...</p>
		{:else if status === 'unknown'}
			<p class="text-orange-400">No response received</p>
		{:else if text}
			<Markdown source={text} />
		{:else if status === 'success'}
			<p class="text-gray-500">Empty response</p>
		{:else}
			<p class="text-gray-600">Awaiting query...</p>
		{/if}
	</div>
</div>

<style>
	@keyframes pulse-glow {
		0%,
		100% {
			box-shadow: inset 0 0 0 0 transparent;
			opacity: 0.7;
		}
		50% {
			box-shadow: inset 0 0 20px -4px var(--node-color);
			opacity: 1;
		}
	}

	.pulse-glow {
		animation: pulse-glow 2s ease-in-out infinite;
	}
</style>
