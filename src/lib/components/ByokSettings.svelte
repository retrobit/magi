<script lang="ts">
	// BYOK key fields for the settings panel — one masked input per gateway,
	// persisted to their own localStorage entry on every keystroke. Only rendered
	// when the deployment opts in (the parent gates on BYOK_ENABLED).
	import { BYOK_GATEWAYS, type ByokKeys } from '$lib/magi/byok';
	import { loadByokKeys, saveByokKeys } from '$lib/byok';

	const saved = loadByokKeys();
	let keys = $state<Record<string, string>>(
		Object.fromEntries(BYOK_GATEWAYS.map((g) => [g.gateway, saved[g.gateway] ?? '']))
	);

	function update(gateway: string, value: string) {
		keys[gateway] = value;
		saveByokKeys(keys as Partial<Record<keyof ByokKeys, string>>);
	}
</script>

<div class="mt-2 flex flex-col gap-2">
	{#each BYOK_GATEWAYS as g (g.gateway)}
		<label class="flex flex-col gap-1">
			<span class="magi-label">{g.label}</span>
			<input
				type="password"
				class="w-full rounded border border-(--magi-border-subtle) bg-(--magi-surface-bg) px-2 py-1 text-xs text-(--magi-text) placeholder:text-(--magi-text-faint) focus:ring-1 focus:ring-(--magi-text-faint) focus:outline-none"
				placeholder={g.placeholder}
				autocomplete="new-password"
				spellcheck="false"
				data-1p-ignore
				data-lpignore="true"
				data-bwignore
				value={keys[g.gateway]}
				oninput={(e) => update(g.gateway, e.currentTarget.value)}
			/>
		</label>
	{/each}
	<p class="magi-meta">
		Keys stay in this browser and ride along only with your own requests — never logged, never
		stored server-side. Tiers unlock for the gateways you cover.
	</p>
</div>
