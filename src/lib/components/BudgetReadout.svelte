<script lang="ts">
	import { RefreshCw } from 'lucide-svelte';
	import { tooltip } from '$lib/actions/tooltip';

	type ProviderName = 'openrouter' | 'anthropic' | 'openai' | 'google';
	type BudgetStatus = 'ok' | 'unavailable' | 'error';

	interface ProviderBudget {
		provider: ProviderName;
		status: BudgetStatus;
		label?: string;
		usage?: number;
		limit?: number | null;
		remaining?: number;
		isFreeKey?: boolean;
		reason?: string;
	}

	interface Props {
		/** When the parent panel becomes visible, the first fetch fires. */
		active: boolean;
	}

	let { active }: Props = $props();

	let providers = $state<ProviderBudget[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let loaded = $state(false);

	const PROVIDER_LABELS: Record<ProviderName, string> = {
		openrouter: 'OpenRouter',
		anthropic: 'Anthropic',
		openai: 'OpenAI',
		google: 'Google'
	};

	async function fetchBudgets(force = false) {
		if (loading) return;
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/magi/budget${force ? '?force=1' : ''}`);
			if (!res.ok) {
				// 404 is the deliberate "endpoint disabled" response on a deploy with no
				// MAGI_API_KEY (the public demo) — surface that, not a bare "HTTP 404".
				throw new Error(
					res.status === 404
						? 'Budget tracking is disabled on this deployment.'
						: `HTTP ${res.status}`
				);
			}
			const body = (await res.json()) as { providers: ProviderBudget[] };
			providers = body.providers;
			loaded = true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	}

	// Lazy: fire the first fetch the moment the settings panel opens. Don't
	// auto-refresh on close/reopen — the user can hit ⟳ if they want fresher.
	$effect(() => {
		// Gate on !error too: a failed fetch (e.g. the demo's intentional 404) leaves
		// loaded=false, and the loading→false toggle would otherwise re-trigger this
		// effect into an infinite retry loop hammering the endpoint.
		if (active && !loaded && !loading && !error) {
			void fetchBudgets();
		}
	});

	function formatMoney(value: number): string {
		// $1,234.56 — comma thousands, two decimals. Fits ~14 chars worst case.
		return value.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	function usageRatio(p: ProviderBudget): number | null {
		if (typeof p.usage !== 'number' || typeof p.limit !== 'number' || p.limit <= 0) return null;
		return Math.min(1, Math.max(0, p.usage / p.limit));
	}
</script>

<div class="flex items-center justify-end">
	<button
		type="button"
		class="text-(--magi-text-faint) transition-colors hover:text-(--magi-text) disabled:opacity-50"
		onclick={() => fetchBudgets(true)}
		disabled={loading || (!loaded && !error)}
		aria-label="Refresh budgets"
		use:tooltip={'Refresh'}
	>
		<RefreshCw size={12} class={loading ? 'animate-spin' : ''} />
	</button>
</div>

<div class="mt-2 flex flex-col gap-2 pl-3">
	{#if !loaded && loading}
		<span class="magi-meta">Loading…</span>
	{:else if error}
		<span class="magi-meta magi-error">{error}</span>
	{:else if loaded}
		{#each providers as p (p.provider)}
			<div class="flex flex-col gap-1">
				<span class="magi-label">{PROVIDER_LABELS[p.provider]}</span>
				{#if p.status === 'ok'}
					{@const ratio = usageRatio(p)}
					{#if typeof p.usage === 'number' && typeof p.limit === 'number'}
						<span class="magi-numeric text-(--magi-text-muted)">
							{formatMoney(p.usage)} / {formatMoney(p.limit)}
						</span>
					{:else if typeof p.usage === 'number'}
						<span class="magi-numeric text-(--magi-text-muted)">
							{formatMoney(p.usage)} <span class="text-(--magi-text-faint)">spent</span>
						</span>
					{/if}
					{#if ratio !== null}
						<div class="h-1 w-full overflow-hidden rounded-sm bg-(--magi-surface-bg)">
							<div
								class="h-full bg-green-500/80 transition-all"
								style="width: {(ratio * 100).toFixed(1)}%"
							></div>
						</div>
					{/if}
					{#if p.isFreeKey}
						<span class="magi-meta">free-tier key</span>
					{/if}
				{:else}
					<span class="magi-meta">{p.reason ?? 'unavailable'}</span>
				{/if}
			</div>
		{/each}
	{/if}
</div>
